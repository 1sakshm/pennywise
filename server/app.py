"""Live routing API + OpenAI-compatible proxy in one FastAPI app.

POST /route  {prompt, lambda}  -> {probs, action, router_latency_ms, lambda_used, router_mode}
POST /answer {prompt, tier}    -> SSE stream of the tier model's answer, then a final cost event
GET  /health                   -> {ok, models_loaded, router_mode, spend_today, spend_cap, stats, ...}
plus /v1/chat/completions and /v1/models from server/proxy.py.

Run: uvicorn server.app:app --port 8000
"""
import json
import os
import threading
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from router.models import TIER_NAMES
from server.proxy import _http, est_tokens, router as proxy_router
from server.state import DAILY_CAP, MAX_PROMPT_CHARS, State, client_ip

app = FastAPI(title="Pennywise", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")],
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"],
                   expose_headers=["x-router-tier", "x-router-confidence", "x-router-latency-ms",
                                   "x-estimated-savings-usd", "x-router-mode", "x-router-sticky"])
app.include_router(proxy_router)
STARTED = time.time()


@app.on_event("startup")
def startup():
    app.state.s = State()
    threading.Thread(target=app.state.s.load_router, daemon=True).start()  # /health reports while loading


def err(status, code, message):
    return JSONResponse(status_code=status, content={"ok": False, "status": code, "message": message})


def guard(st, request, limiter, prompt):
    if not limiter.allow(client_ip(request)):
        return err(429, "rate_limited", "Too many requests from this IP; try again in a minute.")
    if st.stats.over_cap():
        return err(429, "spend_cap_reached", "The live demo's daily spend cap has been reached.")
    if not prompt.strip():
        return err(400, "empty_prompt", "Prompt is empty.")
    if len(prompt) > MAX_PROMPT_CHARS:
        return err(413, "prompt_too_long", f"Prompt exceeds {MAX_PROMPT_CHARS} characters.")
    if st.router is None:
        return err(503, "router_loading" if not st.router_error else "router_error", st.router_error or "Router is loading.")
    return None


class RouteReq(BaseModel):
    prompt: str
    lambda_: float = Field(0.25, alias="lambda")


@app.post("/route")
def route(req: RouteReq, request: Request):
    st = app.state.s
    if (e := guard(st, request, st.route_limit, req.prompt)) is not None:
        return e
    tier, probs, ms, used = st.router.route(req.prompt, req.lambda_)
    return {"ok": True, "action": tier, "probs": probs, "router_latency_ms": round(ms, 1), "lambda_used": used,
            "router_mode": st.router.mode}


class AnswerReq(BaseModel):
    prompt: str
    tier: str


@app.post("/answer")
async def answer(req: AnswerReq, request: Request):
    st = app.state.s
    if req.tier not in TIER_NAMES:
        return err(400, "bad_tier", f"tier must be one of {TIER_NAMES}")
    if (e := guard(st, request, st.answer_limit, req.prompt)) is not None:
        return e
    t = st.tiers[req.tier]
    body = {"model": t["model"], "stream": True, "max_tokens": int(os.environ.get("ANSWER_MAX_TOKENS", 600)),
            "temperature": 0.2, "stream_options": {"include_usage": True},
            "messages": [{"role": "system", "content": "Answer concisely and correctly."},
                         {"role": "user", "content": req.prompt}]}
    url = t["base_url"].rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {st.api_key(req.tier)}"}

    async def gen():
        usage, chars, t0 = None, 0, time.perf_counter()
        try:
            async with _http.stream("POST", url, json=body, headers=headers) as r:
                if r.status_code != 200:
                    yield f"data: {json.dumps({'error': f'upstream returned {r.status_code}'})}\n\n"
                    return
                async for line in r.aiter_lines():
                    if not line.startswith("data:") or line[5:].strip() in ("", "[DONE]"):
                        continue
                    try:
                        c = json.loads(line[5:])
                    except json.JSONDecodeError:
                        continue
                    usage = c.get("usage") or usage
                    for ch in c.get("choices") or []:
                        d = (ch.get("delta") or {}).get("content")
                        if d:
                            chars += len(d)
                            yield f"data: {json.dumps({'delta': d})}\n\n"
        except httpx.HTTPError as e:
            yield f"data: {json.dumps({'error': f'upstream failed: {type(e).__name__}'})}\n\n"
            return
        tin = (usage or {}).get("prompt_tokens", est_tokens(req.prompt) + 10)
        tout = (usage or {}).get("completion_tokens", max(1, chars // 4))
        cost, large_cost = st.costs(req.tier, tin, tout)
        st.stats.record(req.tier, cost, large_cost, routed=True)
        yield f"data: {json.dumps({'done': True, 'tier': req.tier, 'cost_usd': cost, 'large_cost_usd': large_cost, 'input_tokens': tin, 'output_tokens': tout, 'usage_measured': usage is not None, 'answer_ms': round((time.perf_counter() - t0) * 1000)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/health")
def health():
    st = app.state.s
    r = st.router
    return {"ok": True, "models_loaded": r is not None, "router_mode": r.mode if r else None,
            "router_error": st.router_error, "lambdas": r.lambdas if r else [], "modes": st.modes,
            "tiers": {k: v["model"] for k, v in st.tiers.items()},
            "spend_today": round(st.stats.spend_today(), 6), "spend_cap": DAILY_CAP,
            "over_cap": st.stats.over_cap(), "stats": st.stats.public(), "uptime_s": round(time.time() - STARTED)}
