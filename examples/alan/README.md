# Running Alan's agents through the Laya router (via OpenCode)

Alan doesn't call models itself. It drives coding-agent CLIs, so the router goes in at the CLI layer. OpenCode lets you add any OpenAI-compatible provider, and its config schema is documented at <https://opencode.ai/docs/providers/> and <https://opencode.ai/docs/mcp-servers/>.

> **Status:** the config below follows OpenCode's documented schema. The Alan-side steps (Rescan models, whitelisting) are **not verified yet**, because Alan access hadn't arrived when this was written. Results of the checks go in [`docs/ALAN_NOTES.md`](../../docs/ALAN_NOTES.md). Screenshots get added as each step is done.

## 1. Point OpenCode at the proxy
Copy [`opencode.json`](opencode.json) into your project, or merge it into `~/.config/opencode/opencode.json`, and replace `YOUR-DEPLOYMENT` with the proxy URL. This config:
- adds the provider `laya-router` with the models `auto`, `auto-cheap`, `auto-quality`, and the raw `large` tier for the "before" runs. They're selected as `laya-router/auto` and so on.
- makes `laya-router/auto` the default model.
- installs the router's MCP server (`route`, `ask_routed`) next to whatever Alan syncs. **Don't edit or remove the Alan MCP entry Alan writes.**

`limit.context` is set to the smallest context window among the three tiers, because a sticky session can land on any of them. Update it to match `config/models.yaml`.

## 2. In Alan
1. Profile → Computer: enable **OpenCode**.
2. Click **Rescan models**. The `laya-router/*` models should appear. *(check #2 in ALAN_NOTES.md)*
3. Whitelist `laya-router/auto` (plus `auto-cheap`, `auto-quality`, `large`) and optionally set `laya-router/auto` as the default.
4. Start a session. Every request now carries `x-router-tier` headers at the proxy, and `/health` → `stats` counts them (that's what feeds the Savings Counter).

## 3. Why agent sessions don't break
- **Sticky routing:** the proxy routes once per conversation, keyed by system prompt + first user message (or an `x-session-id` header), and keeps that tier for 2 h. It never re-routes on tool-result turns.
- **Tool calling:** `tools`, `tool_choice` and tool messages are forwarded unchanged, including when streaming. All tiers must declare `supports_tools: true`, or the server refuses to start.

## 4. Before/after experiment
Run each task twice, (a) with model `laya-router/large` and (b) with `laya-router/auto`, so cost is measured at the proxy the same way both times. Record cost, wall-clock time and whether the PR's tests pass in `eval/results/alan_before_after.json`. **Small live demo, n = 3–5 tasks. Not a benchmark.**

## 5. If Alan's Sync MCP overwrites our entry
Re-add the `laya-router` block under `mcp` after syncing, and record the behaviour in `docs/ALAN_FEEDBACK.md`.
