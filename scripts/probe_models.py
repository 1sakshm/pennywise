"""Probe candidate models on one OpenAI-compatible endpoint: tool-call round trip + a math check + latency."""
import json, os, sys, time
from openai import OpenAI
sys.path.insert(0, ".")
from router.models import _load_dotenv
_load_dotenv()
c = OpenAI(base_url=os.environ.get("PROBE_BASE", "https://integrate.api.nvidia.com/v1"), api_key=os.environ[os.environ.get("PROBE_KEY_ENV", "NVIDIA_API_KEY")], max_retries=0, timeout=240)
TOOLS = [{"type": "function", "function": {"name": "get_weather", "description": "Get current weather for a city",
          "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]
Q = "A shop sells pens at 3 for $4. Maria buys 27 pens and pays with a $50 bill. How much change does she get? End with 'Answer: <number>'."
for m in sys.argv[1:]:
    res = {"model": m}
    try:
        t = time.perf_counter()
        r = c.chat.completions.create(model=m, messages=[{"role": "user", "content": "What's the weather in Paris? Use the tool."}], tools=TOOLS, temperature=0, max_tokens=300)
        tc = r.choices[0].message.tool_calls
        res["tool_call"] = bool(tc) and tc[0].function.name == "get_weather"
        if tc:
            msgs = [{"role": "user", "content": "What's the weather in Paris? Use the tool."},
                    {"role": "assistant", "content": r.choices[0].message.content, "tool_calls": [x.model_dump() for x in tc]},
                    {"role": "tool", "tool_call_id": tc[0].id, "content": json.dumps({"temp_c": 18, "sky": "clear"})}]
            r2 = c.chat.completions.create(model=m, messages=msgs, tools=TOOLS, temperature=0, max_tokens=300)
            res["tool_roundtrip"] = "18" in (r2.choices[0].message.content or "")
        t = time.perf_counter()
        r = c.chat.completions.create(model=m, messages=[{"role": "user", "content": Q}], temperature=0, max_tokens=1024)
        txt = r.choices[0].message.content or ""
        res["math_ok"] = "Answer: 14" in txt.replace("$", "") or txt.strip().endswith("14")
        res["latency_s"] = round(time.perf_counter() - t, 1)
        res["out_tokens"] = r.usage.completion_tokens if r.usage else None
    except Exception as e:
        res["error"] = f"{type(e).__name__}: {str(e)[:120]}"
    print(json.dumps(res), flush=True)
    time.sleep(2)
