"""OpenAI-compatible proxy: POST /v1/chat/completions, GET /v1/models.

model = "auto" | "auto-cheap" | "auto-quality" -> Laya routes; a raw tier name bypasses routing.
Agent sessions: routing happens once per conversation (keyed by x-session-id header, else a hash
of system prompt + first user message) and sticks for its TTL, so tool-result turns are never
re-routed. tools / tool_choice / tool messages are forwarded unchanged, streaming included.
Response headers: x-router-tier, x-router-confidence, x-router-latency-ms, x-estimated-savings-usd.

Tool-call cascade (agent sessions): when a routed request carries `tools` and the routed tier is not the
top tier, the cheap tier's reply is validated before it reaches the client: every tool call must name a
tool from the request and carry valid JSON arguments without garbled characters, and the upstream must
not reject the turn. On a detected failure the turn is retried on the top tier and the session sticks to
it. Cheap first, escalate on evidence (FrugalGPT-style). CASCADE=0 disables it.
"""
import asyncio
import json
import os
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from router.models import TIER_NAMES
from server.state import MAX_REQUEST_CHARS, PROXY_API_KEY, client_ip, text_of

router = APIRouter()
_http = httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15))
CASCADE = os.environ.get("CASCADE", "1") != "0"
TOP = TIER_NAMES[-1]
_BAD = ("\ufffd", "to=functions", "<|")  # replacement char / leaked tool-format tokens


def tool_call_problem(body, tool_calls, content):
    """-> reason string if a cheap-tier reply looks like a broken tool call, else None."""
    names = {(t.get("function") or {}).get("name") for t in body.get("tools") or []}
    if not tool_calls and not (content or "").strip():
        return "empty reply (no text, no tool call)"  # gpt-oss: reasoning only; the agent CLI then ends the session
    if any(b in (content or "") for b in _BAD[1:]):
        return "leaked tool-format tokens in content"
    for tc in tool_calls:
        name, args = tc.get("name") or "", tc.get("arguments") or ""
        if name not in names:
            return f"unknown tool {name!r}"
        if any(b in args or b in name for b in _BAD) or any(ord(c) < 32 and c not in "\n\r\t" for c in args):
            return "garbled tool arguments"
        try:
            json.loads(args or "{}")
        except json.JSONDecodeError:
            return "tool arguments are not valid JSON"
    return None


def oai_error(status, message, type_="invalid_request_error", code=None):
    return JSONResponse(status_code=status, content={"error": {"message": message, "type": type_, "code": code}})


def est_tokens(text):
    return max(1, len(text) // 4)


@router.get("/v1/models")
async def models(request: Request):
    st = request.app.state.s
    ids = list(st.modes) + TIER_NAMES
    return {"object": "list", "data": [{"id": i, "object": "model", "created": 0, "owned_by": "pennywise"} for i in ids]}


async def decide(st, body, request):
    """-> (tier, routing_info dict). Sticky per conversation for auto modes."""
    requested = body.get("model") or "auto"
    if requested in TIER_NAMES:
        return requested, {"routed": False, "confidence": None, "latency_ms": 0.0, "mode": requested}
    if requested not in st.modes:
        raise ValueError(f"unknown model '{requested}'; use one of {list(st.modes) + TIER_NAMES}")
    msgs = body.get("messages") or []
    key = st.sessions.key(msgs, request.headers.get("x-session-id"))
    hit = st.sessions.get(key + "|" + requested)
    if hit:
        return hit["tier"], {**hit["info"], "sticky": True, "latency_ms": 0.0, "session": key + "|" + requested}
    if st.router is None:
        raise RuntimeError(st.router_error or "router is still loading")
    state_text = next((text_of(m) for m in msgs if m.get("role") == "user"), "") or text_of(msgs[-1] if msgs else {})
    tier, probs, ms, lam_used = await asyncio.to_thread(st.router.route, state_text[:8000], st.modes[requested])
    info = {"routed": True, "confidence": probs[tier], "latency_ms": ms, "mode": requested, "lambda": lam_used,
            "probs": probs, "sticky": False, "session": key + "|" + requested}
    st.sessions.put(key + "|" + requested, {"tier": tier, "info": info})
    return tier, info


def routing_headers(tier, info, est_saving):
    h = {"x-router-tier": tier, "x-router-latency-ms": f"{info['latency_ms']:.1f}",
         "x-estimated-savings-usd": f"{est_saving:.6f}", "x-router-mode": info["mode"]}
    if info.get("confidence") is not None:
        h["x-router-confidence"] = f"{info['confidence']:.3f}"
    if info.get("sticky"):
        h["x-router-sticky"] = "1"
    return h


@router.post("/v1/chat/completions")
async def chat_completions(request: Request):
    st = request.app.state.s
    if PROXY_API_KEY and request.headers.get("authorization", "") != f"Bearer {PROXY_API_KEY}":
        return oai_error(401, "invalid API key for this proxy", "authentication_error")
    if not st.proxy_limit.allow(client_ip(request)):
        return oai_error(429, "rate limit exceeded for this IP; try again in a minute", "rate_limit_error", "rate_limited")
    if st.stats.over_cap():
        return oai_error(429, "the public demo's daily spend cap has been reached; try again tomorrow",
                         "rate_limit_error", "spend_cap_reached")
    try:
        body = await request.json()
    except Exception:
        return oai_error(400, "body must be JSON")
    if len(json.dumps(body.get("messages", []))) > MAX_REQUEST_CHARS:
        return oai_error(413, f"request too large (> {MAX_REQUEST_CHARS} chars of messages)")
    try:
        tier, info = await decide(st, body, request)
    except ValueError as e:
        return oai_error(400, str(e), code="model_not_found")
    except RuntimeError as e:
        return oai_error(503, f"router unavailable: {e}", "server_error")

    stream = bool(body.get("stream"))
    in_est = est_tokens(json.dumps(body.get("messages", [])))
    cascade = CASCADE and info.get("routed") and bool(body.get("tools")) and tier != TOP

    def upstream(tn):
        t = st.tiers[tn]
        fwd = {**body, "model": t["model"]}
        if stream and t.get("stream_usage", True):
            fwd["stream_options"] = {**(body.get("stream_options") or {}), "include_usage": True}
        return (t["base_url"].rstrip("/") + "/chat/completions", fwd,
                {"Authorization": f"Bearer {st.api_key(tn)}", "Content-Type": "application/json"})

    def escalate(reason):
        """Cheap tier produced a broken tool call: stick this session to the top tier."""
        print(f"cascade: {tier} -> {TOP} ({reason})", flush=True)
        if info.get("session"):
            st.sessions.put(info["session"], {"tier": TOP, "info": {**info, "escalated": True, "confidence": None}})

    c_in, lc_in = st.costs(tier, in_est, 0)
    est_saving = max(0.0, lc_in - c_in)  # streaming: header known before output tokens, so input-only estimate
    hdrs = {**routing_headers(tier, info, est_saving), **({"x-router-cascade": "armed"} if cascade else {})}

    if not stream:
        async def call(tn):
            url, fwd, h = upstream(tn)
            r = await _http.post(url, json=fwd, headers=h)
            data = _safe_json(r)
            u = data.get("usage") or {} if isinstance(data, dict) else {}
            cost, large_cost = st.costs(tn, u.get("prompt_tokens", in_est), u.get("completion_tokens", 0))
            st.stats.record(tn, cost, large_cost, info["routed"])
            return r.status_code, data, cost, large_cost
        try:
            code, data, cost, large_cost = await call(tier)
            served = tier
            if cascade:
                msg = ((data.get("choices") or [{}])[0].get("message") or {}) if code == 200 else {}
                tcs = [{"name": (x.get("function") or {}).get("name"), "arguments": (x.get("function") or {}).get("arguments")}
                       for x in msg.get("tool_calls") or []]
                problem = f"upstream {code}" if code != 200 else tool_call_problem(body, tcs, msg.get("content"))
                if problem:
                    escalate(problem)
                    code, data, cost, large_cost = await call(TOP)
                    served = TOP
        except httpx.HTTPError as e:
            return oai_error(502, f"upstream '{tier}' unreachable: {type(e).__name__}", "server_error")
        h = {**routing_headers(served, info, max(0.0, large_cost - cost)), **({"x-router-escalated": "1"} if served != tier else {})}
        return JSONResponse(status_code=code, content=data, headers=h)

    async def run(tn, buffer):
        """Stream tier `tn`; if buffer is a list, hold lines back (for validation) instead of yielding.
        Returns (status, tool_calls, content) through the `result` list."""
        url, fwd, h = upstream(tn)
        usage, out_chars, calls, content, status = None, 0, {}, "", 200
        stream_error = None
        try:
            async with _http.stream("POST", url, json=fwd, headers=h) as r:
                status = r.status_code
                if r.status_code != 200:
                    err = (await r.aread()).decode(errors="replace")[:500]
                    line = f"data: {json.dumps({'error': {'message': f'upstream {tn} returned {r.status_code}: {err}', 'type': 'server_error'}})}\n"
                    if buffer is None:
                        yield line + "\n"
                    return
                async for line in r.aiter_lines():
                    if line.startswith("data:") and line[5:].strip() not in ("", "[DONE]"):
                        try:
                            chunk = json.loads(line[5:])
                            if chunk.get("error"):
                                stream_error = str(chunk["error"])[:200]  # upstream error inside a 200 stream
                            usage = chunk.get("usage") or usage
                            for ch in chunk.get("choices") or []:
                                d = ch.get("delta") or {}
                                content += d.get("content") or ""
                                out_chars += len(d.get("content") or "") + len(json.dumps(d.get("tool_calls") or ""))
                                for tc in d.get("tool_calls") or []:
                                    c = calls.setdefault(tc.get("index", 0), {"name": "", "arguments": ""})
                                    f = tc.get("function") or {}
                                    c["name"] += f.get("name") or ""
                                    c["arguments"] += f.get("arguments") or ""
                        except json.JSONDecodeError:
                            pass
                    if buffer is None:
                        yield line + "\n"
                    else:
                        buffer.append(line + "\n")
        except httpx.HTTPError as e:
            status = 599
            if buffer is None:
                yield f"data: {json.dumps({'error': {'message': f'upstream {tn} failed: {type(e).__name__}', 'type': 'server_error'}})}\n\n"
        finally:
            tin = (usage or {}).get("prompt_tokens", in_est)
            tout = (usage or {}).get("completion_tokens", est_tokens("x" * out_chars) if out_chars else 0)
            cost, large_cost = st.costs(tn, tin, tout)
            st.stats.record(tn, cost, large_cost, info["routed"])
            result.append((status if not stream_error else 598, list(calls.values()), content))

    result = []

    async def gen():
        if not cascade:
            async for line in run(tier, None):
                yield line
            return
        held = []
        async for _ in run(tier, held):
            pass
        status, calls, content = result[-1]
        problem = f"upstream {status}" if status != 200 else tool_call_problem(body, calls, content)
        if not problem:
            for line in held:
                yield line
            return
        escalate(problem)
        async for line in run(TOP, None):
            yield line

    return StreamingResponse(gen(), media_type="text/event-stream", headers=hdrs)


def _safe_json(r):
    try:
        return r.json()
    except Exception:
        return {"error": {"message": r.text[:500], "type": "upstream_error"}}


def stats_snapshot(st):
    return {**st.stats.public(), "at": time.time()}
