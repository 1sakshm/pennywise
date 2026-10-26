"""MCP server (stdio) exposing Pennywise as two tools. Thin wrapper over the deployed proxy.

  route(prompt)                       -> tier, confidence, router latency, probabilities
  ask_routed(prompt, mode="auto")     -> answer from the routed tier + routing metadata/cost

Config: PENNYWISE_URL (default http://127.0.0.1:8000), optional PENNYWISE_KEY.
Built on the official MCP Python SDK (`mcp` >= 2, `MCPServer`).
Run: python -m integrations.mcp.server
"""
import os

import httpx
from mcp.server import MCPServer

URL = os.environ.get("PENNYWISE_URL", "http://127.0.0.1:8000").rstrip("/")
KEY = os.environ.get("PENNYWISE_KEY", "unused")
MODES = ("auto", "auto-cheap", "auto-quality")

mcp = MCPServer("pennywise")


async def _modes(client: httpx.AsyncClient) -> dict:
    r = await client.get(f"{URL}/health")
    r.raise_for_status()
    return r.json().get("modes", {})


@mcp.tool()
async def route(prompt: str, mode: str = "auto") -> dict:
    """Ask Pennywise (an RL-trained Laya router) which model tier (small / medium / large) a request needs,
    without calling any LLM. Returns the chosen tier, its confidence, all three probabilities and
    the router latency. Use it to decide whether a sub-task is cheap enough to delegate."""
    if mode not in MODES:
        return {"error": f"mode must be one of {MODES}"}
    async with httpx.AsyncClient(timeout=30) as c:
        lam = (await _modes(c)).get(mode, 0.25)
        r = await c.post(f"{URL}/route", json={"prompt": prompt, "lambda": lam})
        j = r.json()
    if not j.get("ok"):
        return {"error": j.get("message", "router unavailable"), "status": j.get("status")}
    return {"tier": j["action"], "confidence": round(j["probs"][j["action"]], 3), "probabilities": j["probs"],
            "router_latency_ms": j["router_latency_ms"], "mode": mode, "lambda": j.get("lambda_used")}


@mcp.tool()
async def ask_routed(prompt: str, mode: str = "auto") -> dict:
    """Answer a bounded sub-task (summary, classification, small edit, quick question) using the
    cheapest model tier Pennywise judges sufficient. mode: auto | auto-cheap | auto-quality.
    Returns the answer plus which tier answered, router confidence and estimated savings."""
    if mode not in MODES:
        return {"error": f"mode must be one of {MODES}"}
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{URL}/v1/chat/completions", headers={"Authorization": f"Bearer {KEY}"},
                         json={"model": mode, "messages": [{"role": "user", "content": prompt}]})
    if r.status_code != 200:
        try:
            msg = r.json()["error"]["message"]
        except Exception:
            msg = r.text[:300]
        return {"error": msg, "http_status": r.status_code}
    j = r.json()
    h = r.headers
    return {"answer": j["choices"][0]["message"].get("content"), "tier": h.get("x-router-tier"),
            "confidence": h.get("x-router-confidence"), "router_latency_ms": h.get("x-router-latency-ms"),
            "estimated_savings_usd": h.get("x-estimated-savings-usd"), "usage": j.get("usage")}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--http", action="store_true",
                    help="serve over streamable HTTP (for remote connectors, e.g. Alan 'Add custom connector')")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    if a.http:  # endpoint: http://<host>:<port>/mcp
        mcp.run(transport="streamable-http", host=a.host, port=a.port, stateless_http=True)
    else:
        mcp.run(transport="stdio")
