"""Tool-call cascade: a malformed tool call from a cheap tier is retried on the top tier, and the session
sticks there. Against the mock upstream (which breaks tool names for prompts containing BADTOOL):
  MODELS_CONFIG=tests/models.mock.yaml MOCK_KEY=x uvicorn tests.mock_upstream:app --port 8001
  MODELS_CONFIG=tests/models.mock.yaml MOCK_KEY=x uvicorn server.app:app --port 8010
  PROXY_URL=http://127.0.0.1:8010/v1 python tests/test_cascade.py
"""
import os
import sys
import uuid

from openai import OpenAI

URL = os.environ.get("PROXY_URL", "http://127.0.0.1:8000/v1")
c = OpenAI(base_url=URL, api_key=os.environ.get("PROXY_API_KEY", "x"))
TOOLS = [{"type": "function", "function": {"name": "read", "description": "read a file",
                                           "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}}]
fails = 0


def check(name, cond, detail=""):
    global fails
    fails += not cond
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))


for stream in (False, True):
    tag = "stream" if stream else "non-stream"
    msgs = [{"role": "user", "content": f"BADTOOL please read the file {uuid.uuid4().hex[:6]}"}]
    if not stream:
        r = c.chat.completions.with_raw_response.create(model="auto", messages=msgs, tools=TOOLS)
        out = r.parse()
        tc = out.choices[0].message.tool_calls
        check(f"{tag}: client gets a valid tool call", bool(tc) and tc[0].function.name == "read", tc and tc[0].function.name)
        check(f"{tag}: served by the top tier", "mock-large" in out.model, out.model)
        check(f"{tag}: escalation header", r.headers.get("x-router-escalated") == "1", dict(r.headers).get("x-router-escalated"))
    else:
        names, model = "", None
        for ch in c.chat.completions.create(model="auto", messages=msgs, tools=TOOLS, stream=True):
            model = ch.model or model
            for x in (ch.choices[0].delta.tool_calls or []) if ch.choices else []:
                names += (x.function.name or "") if x.function else ""
        check(f"{tag}: client never sees the broken tool name", names == "read", names)
        check(f"{tag}: served by the top tier", "mock-large" in (model or ""), model)
    # next turn of the same session must stay on the top tier
    msgs2 = msgs + [{"role": "assistant", "content": None, "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{}"}}]},
                    {"role": "tool", "tool_call_id": "call_1", "content": "file contents"}]
    out2 = c.chat.completions.create(model="auto", messages=msgs2, tools=TOOLS)
    check(f"{tag}: session sticks to the top tier after escalation", "mock-large" in out2.model, out2.model)

# an empty reply (no text, no tool call) from the cheap tier must escalate
out4 = c.chat.completions.create(model="auto", messages=[{"role": "user", "content": f"EMPTYREPLY read it {uuid.uuid4().hex[:6]}"}], tools=TOOLS)
check("empty cheap-tier reply escalates", "mock-large" in out4.model, out4.model)

# a cheap tier slower than the budget must escalate (run the proxy with CASCADE_TIMEOUT_S=2 for this test)
for stream in (False, True):
    m = [{"role": "user", "content": f"SLOWREPLY read it {uuid.uuid4().hex[:6]}"}]
    if stream:
        model = None
        for ch in c.chat.completions.create(model="auto", messages=m, tools=TOOLS, stream=True):
            model = ch.model or model
    else:
        model = c.chat.completions.create(model="auto", messages=m, tools=TOOLS).model
    check(f"slow cheap tier escalates ({'stream' if stream else 'non-stream'})", "mock-large" in (model or ""), model)

# a healthy session must NOT escalate
out3 = c.chat.completions.create(model="auto", messages=[{"role": "user", "content": f"read the file {uuid.uuid4().hex[:6]}"}], tools=TOOLS)
check("healthy tool call stays on the cheap tier", "mock-large" not in out3.model, out3.model)
print("ALL PASSED" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
