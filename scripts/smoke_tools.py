"""Tool-calling smoke test for every tier in config/models.yaml (Phase 10 acceptance).

For each tier: send a request that should trigger a `get_weather` tool call, feed back a tool
result, and check the model then answers in text. Runs directly against each tier's endpoint,
and (with --proxy URL) through the proxy using the explicit tier name.
    python scripts/smoke_tools.py [--proxy http://127.0.0.1:8000/v1]
"""
import argparse
import json
import sys
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from router.models import TIER_NAMES, load_tiers, make_client  # noqa: E402

TOOLS = [{"type": "function", "function": {
    "name": "get_weather", "description": "Get the current weather for a city",
    "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]
Q = [{"role": "user", "content": "What's the weather in Paris right now? Use the tool."}]


def round_trip(client, model):
    r1 = client.chat.completions.create(model=model, messages=Q, tools=TOOLS, tool_choice="auto", temperature=0)
    m = r1.choices[0].message
    if not m.tool_calls:
        return False, f"no tool call (got text: {str(m.content)[:60]!r})"
    tc = m.tool_calls[0]
    args = json.loads(tc.function.arguments or "{}")
    msgs = Q + [{"role": "assistant", "content": m.content, "tool_calls": [tc.model_dump()]},
                {"role": "tool", "tool_call_id": tc.id, "content": json.dumps({"city": args.get("city"), "temp_c": 18, "sky": "clear"})}]
    r2 = client.chat.completions.create(model=model, messages=msgs, tools=TOOLS, temperature=0)
    text = r2.choices[0].message.content or ""
    return ("18" in text), f"called {tc.function.name}({args}); final: {text[:70]!r}"


def main(a):
    tiers = load_tiers(require_tools=True)
    tiers.pop("_generation")
    fails = 0
    for t in TIER_NAMES:
        ok, msg = round_trip(make_client(tiers[t]), tiers[t]["model"])
        print(f"{'PASS' if ok else 'FAIL'} direct {t:6s} {tiers[t]['model']}: {msg}")
        fails += not ok
        if a.proxy:
            ok, msg = round_trip(OpenAI(base_url=a.proxy, api_key="unused"), t)
            print(f"{'PASS' if ok else 'FAIL'} proxy  {t:6s}: {msg}")
            fails += not ok
    print("ALL PASSED" if not fails else f"{fails} FAILED")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy", default="")
    main(ap.parse_args())
