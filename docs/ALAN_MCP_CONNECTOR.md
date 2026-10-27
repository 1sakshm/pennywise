# Pennywise in Alan via MCP: setup and verification

**Status (2026-10-27, 12:22 IST): working.** Agents in the Alan desktop app can call both Pennywise tools, `route` and `ask_routed`, through a custom MCP connector. The connector runs the published npm package `pennywise-mcp@0.1.0`.

## What was connected

`pennywise-mcp` is a stdio MCP server. It runs the RL-trained Laya router locally on CPU through ONNX Runtime and exposes two tools:

| Tool | What it does | Needs a key? |
|---|---|---|
| `route(prompt, mode?)` | Picks the cheapest tier (small / medium / large) the router expects to get the request right. Returns the tier, model id, probabilities, confidence and latency. | No |
| `ask_routed(prompt, mode?, system?, max_tokens?)` | Routes the prompt, then answers it with that tier's model on the NVIDIA API. If the cheaper model errors or returns nothing, it escalates to large. Returns the answer plus a `pennywise: {...}` metadata line. | `NVIDIA_API_KEY` |

## Working configuration

Alan → **Settings → Plugins → MCP → pennywise** (Add custom connector → **Command**):

| Field | Value |
|---|---|
| Name / display name | `pennywise` |
| Command | `cmd` |
| Arguments (one per line) | `/c`<br>`npx`<br>`-y`<br>`pennywise-mcp` |
| Environment | `NVIDIA_API_KEY` = `${NVIDIA_API_KEY}` (the actual key is entered with the connector's **Enter API key** button) |
| Scope | Personal (team: Saksham's team) |
| Status | **Connected** |

On macOS or Linux, the same connector should work with Command `npx` and arguments `-y` / `pennywise-mcp` (not tested). The package README documents both forms.

## Why it didn't work at first, and the fix

The first connector had Command `npx` and a single argument line, `-y pennywise-mcp`. Alan reported it as "Connected", but the agent said there was no pennywise tool, and no server process ever started. There were two causes:

1. **On Windows, `npx` is a `.cmd` script.** Alan starts the command without a shell, so `npx` can't start.
2. **Alan's Arguments field takes one argument per line.** `-y pennywise-mcp` on one line is passed as a single argument.

Each launch form was tested with a real MCP handshake (spawn, then `initialize`, `tools/list`, `tools/call route`):

| Command / arguments | Result |
|---|---|
| `npx` / `-y`, `pennywise-mcp` | Fails to start (`ENOENT`) |
| `npx.cmd` / `-y`, `pennywise-mcp` | Fails to start (`EINVAL`: Node won't run `.cmd` files without a shell) |
| `C:\Program Files\nodejs\node.exe` / script path | Alan won't save it: "Enter a program name such as npx or uvx, without a path or arguments" |
| `node` / `…\npm\node_modules\pennywise-mcp\bin\pennywise-mcp.js` | Works (used first as an interim fix) |
| **`cmd` / `/c`, `npx`, `-y`, `pennywise-mcp`** | **Works: this is the current configuration** |

## Evidence that it's fully working

**1. Alan starts the server.** In a new chat, Alan started this process chain; I checked it with `Get-CimInstance Win32_Process`:

```
cmd /c npx -y pennywise-mcp                       (PID 13492, 12:22:07)
└─ node npx-cli.js -y pennywise-mcp
   └─ cmd.exe /d /s /c pennywise-mcp
      └─ node …\npm\node_modules\pennywise-mcp\bin\pennywise-mcp.js   (PID 23152)
```

On this machine npx resolved to the globally installed `pennywise-mcp@0.1.0`, the same version as on npm. Outside Alan, run from an empty folder, npx fetched the package from the npm registry, and the handshake succeeded in 5.5 s.

**2. The agent sees both tools.** Agent: Alan Code · Auto Router (→ DeepSeek V4.1 Flash). Asked to list its pennywise tools, it named `route` and `ask_routed` with their descriptions and arguments.

**3. `route` returns real router output.** Prompt: "design a distributed rate limiter with exact per-user quotas across regions":

```json
{"tier":"medium","probabilities":{"small":0.1394,"medium":0.8558,"large":0.0047},
 "confidence":0.8558,"lambda":0.5,"mode":"auto","latency_ms":345,"tokens":59,"model":"openai/gpt-oss-20b"}
```

**4. `ask_routed` answers end to end through the NVIDIA API.** Prompt: "Explain why the sky is blue in one sentence." The answer came back with:

```
pennywise: {"routed_to":"medium","answered_by":"medium","model":"openai/gpt-oss-20b","router_confidence":0.8408,
            "escalated":null,"tokens":{"in":75,"out":91},"list_price_usd":0.00001,"seconds":20.81}
```

With the earlier `node` configuration, the same chat-level tests also passed. The agent called `route` once per step while planning a multi-step task, so it uses the tool unprompted mid-task, not only when asked once.

## Things to know

- **Every tested prompt routed to medium.** That includes the rate-limiter design prompt, where the large tier got only 0.0047. This is the trained `auto` policy (λ = 0.5) behaving as described in the README's "honest reading": it sends about 97% of requests to the medium tier. The integration works; routing quality is a separate question.
- **Editing the connector clears the stored key.** The status changes to "Needs setup" until you click **Enter API key** again.
- **First run on a new machine:** the package downloads 2.0 GB of router weights (sha256-verified) into `~/.cache/pennywise`. Until that finishes, the tools reply "warming up". You can prefetch them with `npx -y pennywise-mcp --download`.
- **No per-chat connector toggle:** the composer's **+** menu only lists agents and Files. Connectors apply to every new agent run.
- **Agents take instructions literally.** A demo prompt like "before each step of this task, call `route`… Task: add input validation to a Flask endpoint" made the agent build the app in the chat's workspace and try to `pip install` packages. Use a scratch workspace for demos like that.

## Evidence files

The detailed run log is `D:\AlanBench\connector_report.md`. Screenshots are in `D:\AlanBench\connector_shots\` (kept out of git). The ones for the current configuration are:

- `D:\AlanBench\connector_shots\15_npm_form_connected.png`: connector Connected with `cmd /c npx -y pennywise-mcp`
- `D:\AlanBench\connector_shots\16_npm_tools_listed.png`: agent lists `route` and `ask_routed`
- `D:\AlanBench\connector_shots\17_npm_route_and_ask_routed.png`: raw `route` JSON and `ask_routed` answer
- `D:\AlanBench\connector_shots\18_npm_pennywise_line_end.png`: end of the `pennywise:` metadata line
