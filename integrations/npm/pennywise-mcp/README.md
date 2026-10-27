# pennywise-mcp

**Pennywise** as an MCP server. An RL-trained open decision model (Laya, ModernBERT-large) reads each request and picks the cheapest model tier that will still get it right:

- **small**: `nvidia/nemotron-3.5-bolt-e4b`
- **medium**: `openai/gpt-oss-20b`
- **large**: `nvidia/nemotron-3-ultra-550b-a55b`

The router runs **locally on CPU** (about 0.2 s per decision) through ONNX Runtime. No Python is needed.

In our agent benchmark (10 real coding tasks), Pennywise finished **10/10 in 11.0 min**. Alan's built-in Auto Router also finished 10/10, but took 36.9 min, so Pennywise was **3.4× faster** at the same success rate.

Site: https://getpennywise.pages.dev

## Add it to Alan

Go to **Settings → Plugins → MCP → Add custom connector → Command** and fill in the fields for your OS. Alan's **Arguments** field takes **one argument per line**.

**Windows**

| Field | Value |
|---|---|
| Command | `cmd` |
| Arguments | `/c`<br>`npx`<br>`-y`<br>`pennywise-mcp` (four lines) |
| Environment | `NVIDIA_API_KEY` = `${NVIDIA_API_KEY}` |

On Windows, `npx` is a `.cmd` script, which only starts through a shell. Without `cmd /c`, Alan can't launch it and the agent sees no pennywise tools. `npx.cmd` doesn't work either, and the Command field won't take a full path.

**macOS / Linux**

| Field | Value |
|---|---|
| Command | `npx` |
| Arguments | `-y`<br>`pennywise-mcp` (two lines) |
| Environment | `NVIDIA_API_KEY` = `${NVIDIA_API_KEY}` |

After saving, click **Enter API key** on the connector and paste your NVIDIA key (free at build.nvidia.com). The key is only needed for `ask_routed`. Editing the connector later clears the stored key, so you'll need to enter it again.

The same command works in any MCP client (Claude Desktop, Cursor, …):

```json
{ "mcpServers": { "pennywise": { "command": "npx", "args": ["-y", "pennywise-mcp"], "env": { "NVIDIA_API_KEY": "nvapi-…" } } } }
```

On Windows, use `"command": "cmd", "args": ["/c", "npx", "-y", "pennywise-mcp"]`.

**First run:** the router weights (2.0 GB) are downloaded once from Hugging Face. Each file is sha256-verified, then cached in `~/.cache/pennywise`. Until the download finishes, tools reply "warming up". To prefetch the weights ahead of time, run:

```bash
npx -y pennywise-mcp --download
```

## Tools

| Tool | What it does |
|---|---|
| `route(prompt, mode?)` | Returns `{tier, model, probabilities, confidence, latency_ms}`. Runs locally and needs no API key. |
| `ask_routed(prompt, mode?, system?, max_tokens?)` | Routes the prompt, then answers it with that tier's model on the NVIDIA API. If the cheaper model errors or returns nothing, it escalates to **large**. Returns the answer plus routing metadata. |

**Modes:**

- `auto`: balanced (λ = 0.5)
- `auto-quality`: leans toward stronger tiers (λ = 0)
- `auto-cheap`: currently the same policy as `auto`

Honest note: each policy behaves close to a fixed tier. In our checks, `auto` picked medium for almost every prompt and `auto-quality` picked large.

## CLI

```bash
npx -y pennywise-mcp --route "Prove there are infinitely many primes" --mode auto-quality
```

## Environment

| Variable | Default |
|---|---|
| `NVIDIA_API_KEY` | — (required for `ask_routed`) |
| `PENNYWISE_BASE_URL` | `https://integrate.api.nvidia.com/v1` (any OpenAI-compatible endpoint) |
| `PENNYWISE_SMALL_MODEL` / `_MEDIUM_MODEL` / `_LARGE_MODEL` | the tier models above |
| `PENNYWISE_CACHE` | `~/.cache/pennywise/<version>` |
| `PENNYWISE_WEIGHTS_URL` | `https://huggingface.co/SuckSome/pennywise-router/resolve/main` |
| `PENNYWISE_WEIGHTS_DIR` | Use local ONNX files and skip the download |
| `PENNYWISE_TIMEOUT_S` | `120` |

## Fidelity

The Node port matches the Python reference on 31 test prompts, including Unicode, emoji, overlong input and `[MASK]` injection:

- identical token ids
- 62/62 identical decisions
- max |Δp| = 0

To check it yourself, run `npm test`.

Author: Saksham Sharma (BITS Pilani). License: Apache-2.0.
