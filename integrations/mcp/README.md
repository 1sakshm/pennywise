# Pennywise — MCP server

Two tools over stdio, built on the official MCP Python SDK (`mcp` ≥ 2, `MCPServer`):

| tool | what it does |
|---|---|
| `route(prompt, mode="auto")` | Returns which tier (small/medium/large) Laya would use, with confidence, all probabilities and router latency. **No LLM call.** |
| `ask_routed(prompt, mode="auto")` | Answers a bounded sub-task on the routed tier and returns the answer, tier, confidence and estimated savings. |

`mode` is one of `auto`, `auto-cheap` or `auto-quality`. Config is via env: `PENNYWISE_URL` (the proxy's base URL, without `/v1`) and optionally `PENNYWISE_KEY`.

```bash
pip install "mcp>=2" httpx
python -m integrations.mcp.server        # run from the repo root
```

## Install snippets

**OpenCode** (`opencode.json`, which is the Alan path; schema from <https://opencode.ai/docs/mcp-servers/>):
```json
{
  "mcp": {
    "pennywise": {
      "type": "local",
      "command": ["python", "-m", "integrations.mcp.server"],
      "enabled": true,
      "environment": { "PENNYWISE_URL": "https://YOUR-DEPLOYMENT" }
    }
  }
}
```

**Claude Code**
```bash
claude mcp add pennywise -e PENNYWISE_URL=https://YOUR-DEPLOYMENT -- python -m integrations.mcp.server
```

**Cursor / Claude Desktop** (`mcpServers` JSON):
```json
{ "mcpServers": { "pennywise": { "command": "python", "args": ["-m", "integrations.mcp.server"],
  "env": { "PENNYWISE_URL": "https://YOUR-DEPLOYMENT" } } } }
```

The `-m integrations.mcp.server` form has to run from the repo root. Otherwise, use the absolute path to `integrations/mcp/server.py`.

## Tested
`tests/mcp_client_test.py` drives the server with the official MCP stdio client. It lists the tools and calls `route` and `ask_routed` against a local proxy.
