"""The whole integration: change base_url. Works with the official openai SDK, streaming or not.

    PENNYWISE_URL=https://YOUR-DEPLOYMENT python examples/quickstart.py
"""
import os

from openai import OpenAI

client = OpenAI(base_url=os.environ.get("PENNYWISE_URL", "http://127.0.0.1:8000") + "/v1", api_key="unused")

# non-streaming: the routing decision comes back in response headers
raw = client.chat.completions.with_raw_response.create(
    model="auto",  # or "auto-cheap" / "auto-quality" / an explicit tier "small" | "medium" | "large"
    messages=[{"role": "user", "content": "In one sentence, what does a reverse proxy do?"}],
)
r = raw.parse()
print(r.choices[0].message.content)
print({k: v for k, v in raw.headers.items() if k.startswith("x-router") or k == "x-estimated-savings-usd"})

# streaming
stream = client.chat.completions.create(
    model="auto", stream=True,
    messages=[{"role": "user", "content": "Write a haiku about cheap inference."}],
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
