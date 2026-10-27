# Alan side of the router benchmark: run report

## 1. When and what
- **Date:** Tue 2026-10-27 (IST).
- **Time range:** 02:12 → 06:08 IST. Tasks 01–06 ran 02:15–03:00. The operator session was then interrupted and resumed at 05:49, and tasks 07–10 ran 05:50–06:04. No Alan session was running during the gap. Each task got exactly one attempt.
- **Alan version** (user menu): Web v0.7.257 · Desktop v0.3.115. Plan: Individual · Pro. Team: "Saksham's team". Computer: "sucksome" (local).
- **Agent / model:** Alan Code · **Auto Router**, picked from the model menu for every task. Every session started from a new local session whose folder was set to that task's folder (via "Add local directory").

## 2. Results

| Task | Level | Routed model | Minutes | What the agent said at the end | Odd |
|---|---|---|---|---|---|
| 01_off_by_one | easy | DeepSeek V4.1 Flash | 2.9 | Fixed `range(1, n)` → `range(1, n + 1)`. Couldn't run pytest; checked the asserts directly, "they all pass". | Tried `pip install pytest` on the MSYS2 python (failed, no pip). No tests run with pytest. |
| 02_slugify | easy | DeepSeek V4.1 Flash | 3.3 | "tests pass (1 passed)", run with the Anaconda interpreter | — |
| 03_palindrome | easy | DeepSeek V4.1 Flash | 4.2 | "pytest -q via the Anaconda install: 1 passed" | — |
| 04_parse_kv | medium | DeepSeek V4.1 Flash | 4.6 | `split('=', 1)` + skip empty segments. "All three test assertions pass when run directly"; couldn't run pytest. | No tests run with pytest. |
| 05_merge_intervals | medium | DeepSeek V4.1 Flash | 10.4 | Sorted input, `<=` for touching, `max()` for contained. "tests pass (1 passed)" via `D:\Anaconda\python.exe -m pytest -q`. | UI showed "Still working…" after ~8 min; slowest task. |
| 06_roman | medium | DeepSeek V4.1 Flash | 6.2 | "Tests pass: 11 passed" via `D:\Anaconda\Scripts\pytest.exe` | — |
| 07_lru_cache | hard | DeepSeek V4.1 Flash | 0.7 | dict + doubly linked list with sentinels. "Tests pass (4 passed)". | — |
| 08_expr_eval | hard | DeepSeek V4.1 Flash | 1.0 | Recursive-descent parser. "All 12 tests pass." | Reworded calc.py's docstring ("Do not use eval()" → "Parsed by hand, without eval") so the source no longer contains the literal `eval(` that `test_no_eval` checks for. It was explicit that the tests were not modified. The summary line said "edited 2 files", but `git status` shows only calc.py modified. |
| 09_dijkstra_bug | hard | DeepSeek V4.1 Flash | 2.9 | Records `prev`, skips stale heap entries, reverses the path, exits early at dst. "python -m pytest -q → 4 passed" plus a Bellman-Ford cross-check on 300 random graphs. | Ran a PowerShell probe of `%LOCALAPPDATA%\Programs\Python` to find an interpreter. |
| 10_csv_quotes | hard | DeepSeek V4.1 Flash | 0.7 | Character-by-character parser. "All 9 tests pass" via `D:\Anaconda\python.exe -m pytest -q`. | — |

- **Auto Router picked DeepSeek V4.1 Flash for all 10 tasks.** The badge on every session read "Auto · DeepSeek V4.1 Flash". I never saw the text "Auto Router sent this prompt to …"; the routed model only appears in that badge.
- **Minutes** come from the UI's "Worked for X" line, which matched my send and finish times.
- **Files changed** (read-only `git status` after the run): each folder has only its source file modified, plus an untracked `__pycache__/`. **No `test_*.py` file was modified in any folder.**
- **Pass/fail is the agent's own claim.** I did not run the tests; `bench/score.py` checks them.
- **Environment issue the scorer should know about:** the `python` on the agent's PATH is MSYS2's (`C:\msys64\ucrt64\bin\python.exe`), which has no pytest or pip. The agent found Anaconda (`D:\Anaconda`) on its own for 8 tasks. For 01 and 04 it never ran pytest and only checked the assertions by hand.

## 3. Usage by model (cost data)
- **Where:** user menu (bottom-left) → **Settings → Account → Usage**. The page has a "Usage by model" table (input, output, cached, total tokens, share) and a "Recent CLI sessions" table. It meters "Token usage from the Alan CLI". "View team usage" is a separate link, which I didn't need.
- **Before** (`alan_evidence/usage_before.png/.json`): 0 tokens, 0 sessions, "No model usage in this period yet."
- **After** (`alan_evidence/usage_after.png/.json`): DeepSeek V4.1 Flash only. Input **817K**, output **12K**, cached **1.4M**, total **2.2M**, 100% share. 10 sessions, cache hit 62.7%, avg session 4m, Alan Code allowance 3% spent.
- **Precision:** the UI only shows rounded values (K/M), and hovering didn't reveal exact numbers. `alan_tokens_raw.json` therefore holds rounded figures (after − before = after, because before was 0).
- **`alan_tokens.json` was not written.** I'm not confident of the OpenRouter id for "DeepSeek V4.1 Flash", so the other session should map it.
- **Extra screenshot (outside the brief's list):** `alan_evidence/usage_after_sessions.png` shows the per-session table (8 of the 10 sessions are listed, between 186K and 278K tokens each).

## 4. Deviations, approvals, declines
- No permission prompts appeared; Alan Code ran its edits and commands without asking. No questions were asked, so I never had to reply "continue". There were no push, PR or merge attempts, so there was nothing to decline.
- **Alan's agent ran commands outside the task folder.** On 01 it ran `pip install pytest` against the MSYS2 interpreter, which failed. Several tasks invoked the Anaconda interpreter, and on 09 it probed Python install paths. Alan didn't prompt for any of these, so I couldn't intervene.
- For every task I pasted the TASK.md text exactly, via the clipboard.
- The operator session (mine, not Alan's) was interrupted after task 06 and resumed about 2.8 h later. During the interruption the task 06 screenshot was taken but not saved; I saved it on resume from the captured image. Nothing was re-run.
- The folder dialog blocked typed paths, so I navigated to each folder by clicking. That doesn't affect the results.

## 5. Step D (Alan + Pennywise MCP demo)
**Not done.** It's optional, and adding a custom MCP connector is a persistent change to Alan's configuration, which I left for the owner to approve. It also needs the MCP server on port 8765, which I didn't check.

## 6. Other notes for the owner
- Every task routed to the same model, so this comparison is effectively "Pennywise vs. Alan Code on DeepSeek V4.1 Flash".
- Model menu wording: Alan Code tab → "Auto Router" (top), then GLM 5.3, GLM 5.3 Flash, Kimi K3, MiniMax M3.1 Flash, MiniMax M3, Muse Spark, and more. The OpenCode agent defaulted to "OpenCode · Large", and every New Session resets to it, so Auto Router had to be picked again each time.
