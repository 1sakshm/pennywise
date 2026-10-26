"""OpenAI-compatible proxy: POST /v1/chat/completions, GET /v1/models.

model = "auto" | "auto-cheap" | "auto-quality" -> Laya routes; a raw tier name bypasses routing.
Agent sessions: routing happens once per conversation (keyed by x-session-id header, else a hash
of system prompt + first user message) and sticks for its TTL, so tool-result turns are never
re-routed. tools / tool_choice / tool messages are forwarded unchanged, streaming included.
Response headers: x-router-tier, x-router-confidence, x-router-latency-ms, x-estimated-savings-usd.
"""
import asyncio
import json
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from router.models import TIER_NAMES
from server.state import MAX_REQUEST_CHARS, PROXY_API_KEY, client_ip, text_of

router = APIRouter()
_http = httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15))


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
        return hit["tier"], {**hit["info"], "sticky": True, "latency_ms": 0.0}
    if st.router is None:
        raise RuntimeError(st.router_error or "router is still loading")
    state_text = next((text_of(m) for m in msgs if m.get("role") == "user"), "") or text_of(msgs[-1] if msgs else {})
    tier, probs, ms, lam_used = await asyncio.to_thread(st.router.route, state_text[:8000], st.modes[requested])
    info = {"routed": True, "confidence": probs[tier], "latency_ms": ms, "mode": requested, "lambda": lam_used,
            "probs": probs, "sticky": False}
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

    t = st.tiers[tier]
    fwd = {**body, "model": t["model"]}
    stream = bool(body.get("stream"))
    if stream and t.get("stream_usage", True):
        fwd["stream_options"] = {**(body.get("stream_options") or {}), "include_usage": True}
    url = t["base_url"].rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {st.api_key(tier)}", "Content-Type": "application/json"}
    in_est = est_tokens(json.dumps(body.get("messages", [])))
    c_in, lc_in = st.costs(tier, in_est, 0)
    est_saving = max(0.0, lc_in - c_in)  # streaming: header known before output tokens, so input-only estimate

    if not stream:
        try:
            r = await _http.post(url, json=fwd, headers=headers)
        except httpx.HTTPError as e:
            return oai_error(502, f"upstream '{tier}' unreachable: {type(e).__name__}", "server_error")
        if r.status_code != 200:
            return JSONResponse(status_code=r.status_code, content=_safe_json(r), headers=routing_headers(tier, info, 0.0))
        data = r.json()
        u = data.get("usage") or {}
        tin, tout = u.get("prompt_tokens", in_est), u.get("completion_tokens", 0)
        cost, large_cost = st.costs(tier, tin, tout)
        st.stats.record(tier, cost, large_cost, info["routed"])
        return JSONResponse(content=data, headers=routing_headers(tier, info, max(0.0, large_cost - cost)))

    async def gen():
        usage, out_chars = None, 0
        try:
            async with _http.stream("POST", url, json=fwd, headers=headers) as r:
                if r.status_code != 200:
                    err = (await r.aread()).decode(errors="replace")[:500]
                    yield f"data: {json.dumps({'error': {'message': f'upstream {tier} returned {r.status_code}: {err}', 'type': 'server_error'}})}\n\n"
                    return
                async for line in r.aiter_lines():
                    if line.startswith("data:") and line[5:].strip() not in ("", "[DONE]"):
                        try:
                            chunk = json.loads(line[5:])
                            usage = chunk.get("usage") or usage
                            for ch in chunk.get("choices") or []:
                                d = ch.get("delta") or {}
                                out_chars += len(d.get("content") or "") + len(json.dumps(d.get("tool_calls") or ""))
                        except json.JSONDecodeError:
                            pass
                    yield line + "\n"
        except httpx.HTTPError as e:
            yield f"data: {json.dumps({'error': {'message': f'upstream {tier} failed: {type(e).__name__}', 'type': 'server_error'}})}\n\n"
        finally:
            tin = (usage or {}).get("prompt_tokens", in_est)
            tout = (usage or {}).get("completion_tokens", est_tokens("x" * out_chars) if out_chars else 0)
            cost, large_cost = st.costs(tier, tin, tout)
            st.stats.record(tier, cost, large_cost, info["routed"])

    return StreamingResponse(gen(), media_type="text/event-stream", headers=routing_headers(tier, info, est_saving))


def _safe_json(r):
    try:
        return r.json()
    except Exception:
        return {"error": {"message": r.text[:500], "type": "upstream_error"}}


def stats_snapshot(st):
    return {**st.stats.public(), "at": time.time()}
