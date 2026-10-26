import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
async def main():
    async with streamable_http_client("http://127.0.0.1:8765/mcp") as (r, w, *_):
        async with ClientSession(r, w) as s:
            await s.initialize()
            print("tools:", [t.name for t in (await s.list_tools()).tools])
            res = await s.call_tool("route", {"prompt": "Prove that sqrt(2) is irrational."})
            print("route ->", res.structured_content or res.content[0].text)
asyncio.run(main())
