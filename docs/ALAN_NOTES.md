# Alan integration checks (brief §2a)

Status: **not yet run** — requires Alan access (arrives Mon Oct 26, 12 PM IST).

Environment: Windows 11 (not Linux/Fedora), RTX 3050 4 GB.

| # | Check | Answer | Evidence |
|---|-------|--------|----------|
| 1 | Alan desktop app available for this OS (Windows)? | TBD | |
| 2 | After adding a custom OpenAI-compatible provider to OpenCode's config, does **Rescan models** list those models, and can they be whitelisted / selected? | TBD | |
| 3 | Can a Managed Cloud environment use a custom OpenCode config, or is Layer 1 local-only? | TBD | |
| 4 | Do session analytics expose token/cost numbers? (If not, measure at our proxy.) | TBD | |

## Consequences for the build
- If #2 fails: try Claude Code / Codex with a custom base URL; otherwise skip live wiring and say so in the README.
