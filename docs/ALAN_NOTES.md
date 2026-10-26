# Alan integration checks (brief §2a)

Environment: Windows 11, Alan desktop app (`%LOCALAPPDATA%\Programs\@alan-aidesktop\Alan.exe`), $10 plan (hackathon).
Docs read on 2026-10-26: https://docs.tryalan.ai (coding-agents-and-models, local-execution, plugins-and-mcp).

| # | Check | Answer | Evidence |
|---|-------|--------|----------|
| 1 | Is the Alan desktop app available for this OS (Windows)? | **Yes.** It's installed and running, and the user is signed in. | `Alan.exe` process. The docs' local-execution page lists Windows PowerShell/CMD for VM setup. |
| 2 | After adding a custom OpenAI-compatible provider to OpenCode's config, does **Rescan models** list those models, and can they be whitelisted / selected? | **Pending the user's click.** The OpenCode side works. | OpenCode 1.19.4 (`npm i -g opencode-ai`), `~/.config/opencode/opencode.jsonc` → `laya-router` provider at `http://127.0.0.1:8000/v1`. `opencode models laya-router` lists auto / auto-cheap / auto-quality / large, and `opencode run -m laya-router/auto` answered through the proxy (2 requests routed, both to small). The docs don't say whether Alan reads models from a CLI's own config. |
| 3 | Can a Managed Cloud environment use a custom OpenCode config, or is Layer 1 local-only? | TBD | The docs say cloud Agents tabs reflect "catalog support rather than a live install check". Cloud setup supports repos, variables and scripts, so a setup script could write `opencode.jsonc`, but the proxy would need a public URL. |
| 4 | Do Alan's session analytics expose token/cost numbers? | **Not per session, per the docs.** The Org Dashboard shows usage and spend across the org. | Docs: Org Dashboard, Usage and credits. We measure tokens and cost at our proxy (`/health` → stats). |

## Other findings
- **Alan supports custom MCP servers** (MCP tab → "Add custom connector"), contrary to the brief's assumption. That gives Layer 3 a second route besides OpenCode's own MCP config.
- **The Native CLIs tab** can enable the Alan MCP server in the CLIs you run yourself (Claude Code, Codex, Cursor).
- **The Alan Agent custom provider** asks for an OpenCode-supported provider, model and API key, but not a base URL, so it can't point at our proxy directly.
- **Something (probably the Alan app) created `~/.config/opencode/opencode.jsonc` and `.gitignore`** at 12:16 on Oct 26. A backup of the original is at `data/cache/opencode.jsonc.bak`. Watch whether Rescan/Sync rewrites the file.

## Consequences for the build
- If #2 fails: try Claude Code / Codex with a custom base URL. Otherwise skip live wiring and say so in the README.
