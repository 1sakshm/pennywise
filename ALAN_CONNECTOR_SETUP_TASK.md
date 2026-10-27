# Brief for the computer-use session: connect Pennywise to the Alan desktop app

You are operating the **Alan desktop app** on this Windows PC on behalf of its owner. Read this whole file
before you click anything.

Your job is to get the **`pennywise` custom connector** working: an agent run inside Alan must be able to call the
tools **`route`** and **`ask_routed`**. Then record proof that it works.

Write your report to **`D:\AlanBench\connector_report.md`**. Apart from the Pennywise connector in Alan's
settings and that report file, change nothing on this machine.

---

## 1. Background (already done; do not redo)

- **Pennywise** (`D:\AlanAI`) is an RL-trained router. It decides whether a request needs a small, medium or
  large model. It is published on npm as **`pennywise-mcp` 0.1.0**, a standard **stdio MCP server**.
- It is already installed globally on this PC, and its 2 GB router weights are already cached in
  `C:\Users\Saksham\.cache\pennywise\`. **Do not delete that folder.**
- The server was tested outside Alan and works: both tools return correct results.
- **The problem:** the owner added a Command connector in Alan, but when a chat asked to use it, the agent
  said there is no `pennywise` tool. No `pennywise-mcp` process was ever started on the PC, so Alan never
  launched the program. The likely causes are below; most likely first.
  1. **Windows command form.** On Windows, `npx` is a shell script. If Alan launches the command without a
     shell, a bare `npx` cannot start. The fix is one of the full-path forms in §3.
  2. **The connector is not enabled for the chat**, or the chat was started before the connector was added.
  3. **It runs in the cloud sandbox instead of on this computer.**
  4. **It is scoped to a different workspace/team** from the one the chat is in.

---

## 2. Rules

- **Never type, paste or read any API key, password or token.** That includes the NVIDIA key.
  - If Alan asks for a secret value (e.g. a prompt to "enter the key"), **stop and ask the owner to type it
    themselves**, then continue.
  - Leaving `${NVIDIA_API_KEY}` as a placeholder in a connector's environment field is fine. That is the
    variable name, not the key.
- **Don't open, read or copy** `%LOCALAPPDATA%\Alan\production\credential.json`, `D:\AlanAI\.env`, or any
  token file.
- **Only touch the Pennywise connector.** Do not edit, disable or remove any other connector, plugin or setting.
  You may delete and re-create the Pennywise connector itself.
- **Do not close terminals, stop processes, or restart the PC.** Other work is running in the background.
- Don't post anything anywhere, don't accept new terms, and don't sign in to anything.
- Record what actually happened, including failures. Never invent tool output.

---

## 3. Steps

### Step 1: Inspect the existing connector

Open Alan → **Settings → Personal → Plugins → Connections**. The route is
`/settings/personal/plugins?tab=connections`; it may also be labelled "Connectors". Find the Pennywise connector.

Take a screenshot. In the report, write down exactly what each field shows:
- name
- type
- command
- arguments
- environment variable *names* (not values)
- where it runs (this computer / cloud sandbox)
- which workspace/team it belongs to
- any status or error text

### Step 2: Set the configuration

Edit the connector, or delete it and add a new **Command** connector. Set:

| Field | Value |
|---|---|
| Name | `pennywise` |
| Type | **Command** |
| Runs on | **this computer** (local), **not** the cloud sandbox, if Alan offers the choice |
| Command | `C:\Program Files\nodejs\node.exe` |
| Arguments | `C:\Users\Saksham\AppData\Roaming\npm\node_modules\pennywise-mcp\bin\pennywise-mcp.js` |
| Environment | `NVIDIA_API_KEY` = `${NVIDIA_API_KEY}` (see §2: if Alan prompts for the real value, hand over to the owner) |

**Form A (above)** is the most reliable form: absolute paths, no shell needed. If the Arguments field
takes a list, put the whole path as **one** argument.

If Form A fails at Step 4, try these one at a time, in order:

| Form | Command | Arguments |
|---|---|---|
| B | `npx.cmd` | `-y` and `pennywise-mcp` (two arguments) |
| C | `cmd` | `/c`, `npx`, `-y`, `pennywise-mcp` (four arguments) |
| D | `npx` | `-y` and `pennywise-mcp` (the original form; listed only for completeness) |

If the environment field causes trouble, you can **leave the environment empty** for the first test.
`route` needs no key; only `ask_routed` does.

Save, then click **Connect** / enable the connector, if there is such a button. Screenshot the result and any
status text (for example "connected", "failed", "tools: 2").

### Step 3: Enable it for a new chat

1. Make sure you are in the same workspace/team the connector belongs to.
2. Start a **brand-new chat**. Do not reuse "Generate Table Using Pennywise Route Tool"; it started before the
   connector existed.
3. Open the chat's tools/connectors picker (a **+**, plug icon or "Tools" menu near the message box). Make sure
   **pennywise** is switched **on**. Screenshot the picker.

### Step 4: Verify that the agent sees the tools

Send exactly this message:

> List every tool you have from the pennywise connector, with its name and description. If you have none, say "NO PENNYWISE TOOLS".

- **Success:** the reply lists `route` and `ask_routed`. Go to Step 5.
- **Failure:** while it runs (or right after), check whether Alan started the server. Open a PowerShell
  window and run:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'pennywise' } | Select-Object ProcessId, CommandLine
  ```

  Record whether a process appeared. Then go back to Step 2, try the next command form, and repeat Steps 3–4.
  - **No process at all** → Alan isn't launching the command: the form, scope or enable switch is wrong.
  - **A process started but there are still no tools** → note it in the report; that's a different problem.

  If **all four forms fail**, stop and write the report with screenshots of everything you saw.

The first launch can take up to ~30 s. If the agent says the tool is "warming up", wait 10 s and ask again.

### Step 5: Run the demo prompts

In the same chat, send these one at a time. Screenshot each reply, making sure the **tool-call blocks** are
visible.

1. > Use the pennywise `route` tool on each of these and show me a table of tier, model, and confidence: "what's 2+2", "write a haiku about autumn", "design a distributed rate limiter with exact per-user quotas across regions".

   Expected: three `route` calls. The rate-limiter prompt should come back as **large**. Record every tier,
   model and confidence exactly as returned.

2. > Use pennywise `ask_routed` to answer: "Explain why the sky is blue in one sentence."

   Expected: an answer, then a line starting `pennywise: {...}`, showing `routed_to`, `answered_by`, `model`
   and `list_price_usd`. This needs the NVIDIA key. If it says the key is not set, record that and ask the
   owner to re-enter the key in the connector; never type it yourself. The call can take 10–60 s (NVIDIA free
   tier).

3. > Before each step of this task, call pennywise `route` on the step and tell me which tier it would use. Task: add input validation to a small Flask signup endpoint.

   Expected: several `route` calls, one per step.

---

## 4. Deliverable: `D:\AlanBench\connector_report.md`

Include:

1. **Final working configuration**: every field from Step 2 (env var names only), and which form (A–D) worked.
2. **What was wrong**: what the original connector looked like, and what change fixed it.
3. **Attempts log**: for each form you tried, whether a `pennywise` process appeared and whether the agent saw
   the tools.
4. **Demo results**: the table from prompt 1, and the answer plus `pennywise:` line from prompt 2 (or the exact
   error text).
5. **Screenshot list**: full paths of the screenshots you saved, under `D:\AlanBench\connector_shots\`.
   These stay out of git.
6. Anything odd you noticed: error banners, timeouts, prompts for secrets.

When the report is written, tell the owner it's done, and whether Pennywise now works inside Alan (yes/no).
