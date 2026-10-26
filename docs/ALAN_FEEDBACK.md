# Alan feedback log

Every bug, confusing UX, or missing doc hit while using Alan, with steps to reproduce.
To be filed in the Openfire #bug-report channel.

| # | Date | Area | What happened | Steps to reproduce | Expected | Severity |
|---|------|------|---------------|--------------------|----------|----------|
| 1 | 2026-10-26 | Agents → OpenCode → Rescan models | Custom OpenAI-compatible providers defined in OpenCode's own config (`~/.config/opencode/opencode.jsonc`, `provider.laya-router` with 4 models) don't appear in OpenCode's model list after **Rescan models**. The same models are listed by `opencode models` (1.19.4) and work via `opencode run -m laya-router/auto`. | 1) `npm i -g opencode-ai` 2) add a `provider` block with `npm: @ai-sdk/openai-compatible`, `options.baseURL`, `models` 3) Alan → Settings → General → Computers → this computer → Agents → OpenCode On → Rescan models 4) open the models dropdown | Models from the CLI's own config are detected (or the docs say they aren't). Today the docs don't say either way. | Medium: blocks BYO-endpoint / self-hosted model routing through OpenCode |
| 2 | 2026-10-26 | Docs: Coding agents and models | It's unclear where Alan gets each CLI's model list. Alan bundles its own OpenCode (`%LOCALAPPDATA%\Alan\production\provider-clis\versions\opencode_serve\1.19.4`, and `resources\engine\opencode.exe` as the "Alan Code engine"), so it's unclear which config the bundled copy reads. | Read the docs page + inspect the install | A sentence saying whether models come from Alan's catalogue or from the CLI's config/auth | Low (docs) |
