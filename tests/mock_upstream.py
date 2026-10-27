"""Minimal OpenAI-compatible upstream for testing the proxy without real keys.

If `tools` are given and the last message isn't a tool result, it calls the first tool;
after a tool result it answers in text. Content names the model id, so tests can see the tier.
Run: uvicorn tests.mock_upstream:app --port 8001
"""
import json
import time

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()


def reply(body):
    msgs, tools = body["messages"], body.get("tools")
    if tools and msgs[-1]["role"] != "tool":
        fn = tools[0]["function"]["name"]
        first_user = next((m.get("content") or "" for m in msgs if m["role"] == "user"), "")
        if "BADTOOL" in str(first_user) and body["model"] != "mock-large":  # simulate gpt-oss's malformed tool call
            fn = fn + "?json"
        if "EMPTYREPLY" in str(first_user) and body["model"] != "mock-large":  # simulate gpt-oss's empty (reasoning-only) turn
            return "", None
        return None, [{"id": "call_1", "type": "function", "function": {"name": fn, "arguments": json.dumps({"x": 1})}}]
    last = msgs[-1].get("content") or ""
    return f"[{body['model']}] ok: {str(last)[:40]}", None


@app.post("/v1/chat/completions")
async def chat(request: Request):
    body = await request.json()
    first_user = next((m.get("content") or "" for m in body["messages"] if m["role"] == "user"), "")
    if "SLOWREPLY" in str(first_user) and body["model"] != "mock-large":  # simulate a stalled free endpoint
        import asyncio
        await asyncio.sleep(6)
    content, calls = reply(body)
    usage = {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}
    if not body.get("stream"):
        msg = {"role": "assistant", "content": content}
        if calls:
            msg["tool_calls"] = calls
        return {"id": "mock-1", "object": "chat.completion", "created": int(time.time()), "model": body["model"],
                "choices": [{"index": 0, "message": msg, "finish_reason": "tool_calls" if calls else "stop"}],
                "usage": usage}

    def gen():
        base = {"id": "mock-1", "object": "chat.completion.chunk", "created": int(time.time()), "model": body["model"]}
        if calls:
            d = {"role": "assistant", "tool_calls": [{"index": 0, **calls[0]}]}
            yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': d, 'finish_reason': None}]})}\n\n"
            fin = "tool_calls"
        else:
            for w in content.split(" "):
                yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {'content': w + ' '}, 'finish_reason': None}]})}\n\n"
            fin = "stop"
        yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': fin}]})}\n\n"
        if (body.get("stream_options") or {}).get("include_usage"):
            yield f"data: {json.dumps({**base, 'choices': [], 'usage': usage})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
