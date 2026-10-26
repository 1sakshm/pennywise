"""End-to-end proxy checks with the official openai SDK (Phase 10 acceptance, minus real tiers).

Needs the proxy on PROXY_URL (default http://127.0.0.1:8000/v1). Against the mock upstream:
  MODELS_CONFIG=tests/models.mock.yaml MOCK_KEY=x uvicorn tests.mock_upstream:app --port 8001
  MODELS_CONFIG=tests/models.mock.yaml MOCK_KEY=x uvicorn server.app:app --port 8000
  python -m tests.test_proxy
Against the deployed proxy with real tiers: PROXY_URL=https://.../v1 python -m tests.test_proxy
"""
import os
import sys
import time
import uuid

from openai import OpenAI

URL = os.environ.get("PROXY_URL", "http://127.0.0.1:8000/v1")
c = OpenAI(base_url=URL, api_key=os.environ.get("PROXY_API_KEY", "not-needed"))
TOOLS = [{"type": "function", "function": {"name": "read_file", "description": "Read a file",
                                           "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}}]
fails = 0


def check(name, cond, detail=""):
    global fails
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    fails += not cond


def wait_ready():
    import httpx
    for _ in range(120):
        try:
            if httpx.get(URL.rsplit("/v1", 1)[0] + "/health", timeout=5).json().get("models_loaded"):
                return
        except Exception:
            pass
        time.sleep(2)
    sys.exit("router never became ready")


wait_ready()
ids = [m.id for m in c.models.list().data]
check("models list includes auto modes + tiers", {"auto", "auto-cheap", "auto-quality", "small", "medium", "large"} <= set(ids), ids)

uniq = uuid.uuid4().hex[:8]
raw = c.chat.completions.with_raw_response.create(model="auto", messages=[{"role": "user", "content": f"What is 2+2? {uniq}"}])
r = raw.parse()
h = raw.headers
check("non-streaming returns content", bool(r.choices[0].message.content), r.choices[0].message.content)
check("routing headers present", all(k in h for k in ("x-router-tier", "x-router-confidence", "x-router-latency-ms", "x-estimated-savings-usd")),
      {k: h.get(k) for k in h if k.startswith("x-")})

chunks, text = 0, ""
s = c.chat.completions.with_raw_response.create(model="auto", stream=True, messages=[{"role": "user", "content": f"Say hi {uniq}"}])
check("streaming has tier header", "x-router-tier" in s.headers, s.headers.get("x-router-tier"))
for ch in s.parse():
    chunks += 1
    if ch.choices and ch.choices[0].delta.content:
        text += ch.choices[0].delta.content
check("streaming yields content", chunks > 1 and bool(text), f"{chunks} chunks: {text[:40]!r}")

r = c.chat.completions.create(model="large", messages=[{"role": "user", "content": "explicit tier"}])
check("explicit tier bypasses routing", "large" in (r.choices[0].message.content or "") or "large" in r.model, r.model)

# multi-turn agent session with tool calls must stay on one tier
sess = [{"role": "system", "content": f"You are a coding agent {uniq}"}, {"role": "user", "content": "Fix the failing test in utils.py"}]
tiers = []
for turn in range(3):
    raw = c.chat.completions.with_raw_response.create(model="auto", messages=sess, tools=TOOLS)
    tiers.append(raw.headers.get("x-router-tier"))
    m = raw.parse().choices[0].message
    if m.tool_calls:
        sess.append({"role": "assistant", "content": None, "tool_calls": [tc.model_dump() for tc in m.tool_calls]})
        sess.append({"role": "tool", "tool_call_id": m.tool_calls[0].id, "content": "def f(): return 1"})
        check(f"turn {turn}: tool call passed through", m.tool_calls[0].function.name == "read_file")
    else:
        sess.append({"role": "assistant", "content": m.content})
        sess.append({"role": "user", "content": "thanks, now run the tests"})
check("sticky: whole tool-calling session on one tier", len(set(tiers)) == 1, tiers)

# streaming tool call passthrough
got_tool = False
for ch in c.chat.completions.create(model="auto", stream=True, tools=TOOLS,
                                    messages=[{"role": "user", "content": f"read config {uniq}"}]):
    if ch.choices and ch.choices[0].delta.tool_calls:
        got_tool = True
check("streaming tool call passthrough", got_tool)

try:
    c.chat.completions.create(model="gpt-nonexistent", messages=[{"role": "user", "content": "x"}])
    check("unknown model rejected", False)
except Exception as e:
    check("unknown model rejected with 400", "400" in str(e) or "model_not_found" in str(e), str(e)[:80])

print(f"\n{'ALL PASSED' if not fails else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
