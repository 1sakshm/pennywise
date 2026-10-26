import asyncio, json, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command=sys.executable, args=["-m", "integrations.mcp.server"],
                                   env={**os.environ, "PENNYWISE_URL": "http://127.0.0.1:8000"})
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = await s.list_tools()
            print("tools:", [t.name for t in tools.tools])
            for name, args in [("route", {"prompt": "What is 2+2?"}), ("ask_routed", {"prompt": "Name a prime number.", "mode": "auto-cheap"})]:
                res = await s.call_tool(name, args)
                print(name, "->", (res.structured_content or res.content[0].text))
asyncio.run(main())
