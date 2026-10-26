# Brief for the computer-use session: run the Alan side of the router benchmark

You are operating the **Alan desktop app** on this Windows PC, on behalf of the owner of this project.
Read this whole file before doing anything. Write **all outputs into the locations listed in
"Deliverables"**. Nothing else on the machine should change.

---

## 1. What the owner is trying to achieve

The project is **Pennywise** (`D:\AlanAI`): an RL-trained router that sends each LLM request to the cheapest
model tier that will still get it right. It's a hackathon entry for **Openfire**, Alan AI's launch hackathon.
Submissions close **Tue Oct 27, 10 PM IST** (building ends 8 PM).

The Alan desktop app has its own router: **Alan Code → "Auto Router"** ("Auto Router lets Alan choose the
model"). The owner wants an honest, side-by-side benchmark: **Pennywise vs. Alan's Auto Router on the same 10
coding tasks**, measuring:
1. **Tasks "merged"**: the unit tests pass *and* the test file is unchanged.
2. **Cost per merged task**: tokens per model × public list price.
3. **Which model Auto Router picked** for each task, and roughly how long each took.

The Pennywise side is already being run by another session, automatically. **Your job is only the Alan side:**
run the 10 tasks through Alan Code with Auto Router, exactly as written below, and record the results.

Honesty matters more than a good-looking result. Record exactly what happened, including failures. Never
"help" Alan's agent, never fix code yourself, never edit the task folders by hand.

---

## 2. Setup facts (already in place; don't change them)

- **Task folders** (one git repo each, already created):
  `D:\AlanBench\01_off_by_one`, `02_slugify`, `03_palindrome`, `04_parse_kv`, `05_merge_intervals`,
  `06_roman`, `07_lru_cache`, `08_expr_eval`, `09_dijkstra_bug`, `10_csv_quotes`.
  Each contains source file(s), a `test_*.py` file and **`TASK.md`, the exact prompt to send.**
- **Results sheet to fill:** `D:\AlanBench\alan_results.csv`. Columns: `task,level,routed_model,minutes,notes`
  (one row per task, already created; fill the empty columns).
- Background processes are running for the other session: a router proxy on port 8000, an MCP server on port
  8765, and a benchmark script. **Do not close terminals, stop processes or restart the PC.**
- **Don't open, read or copy** `%LOCALAPPDATA%\Alan\production\credential.json` or any token or key.

---

## 3. Steps

### Step A: capture usage BEFORE (needed for cost)
1. Open the Alan desktop app. Find the **Team usage / Org Dashboard / Usage** view that shows **tokens by model**
   (it may be under the organisation or settings area; the docs call it "Team usage" with "Usage by model").
2. Screenshot it (scroll so every model row is visible) and save it as
   `D:\AlanAI\bench\alan_evidence\usage_before.png`.
3. Also transcribe the numbers into `D:\AlanAI\bench\alan_evidence\usage_before.json` as
   `{"<model name exactly as shown>": {"input": N, "output": M, "total": T}}` (use whatever fields are shown;
   `null` for missing).
4. If you can't find any token-by-model view, write that in the report (section 5) and continue. Pass/fail and
   routed models are still valuable.

### Step B: run the 10 tasks (one at a time, in order 01 → 10)
For each folder `D:\AlanBench\NN_<task>`:
1. In Alan, start a **new local session on this computer** whose working directory / workspace is that task folder.
   (If Alan asks to add the folder as a workspace or project, allow it, for that folder only.)
2. Choose agent **Alan Code** and model **Auto Router**. If Auto Router isn't offered, stop and write that in the
   report; don't substitute another model.
3. Open that folder's `TASK.md`, copy its text **exactly**, paste it as the first and only prompt, and send it.
4. Let the agent work. Rules while it runs:
   - If it asks for **permission to edit files or run commands inside that task folder** (e.g. `python -m pytest`),
     **approve**.
   - If it asks a question, reply only: `continue`.
   - Don't give hints, don't paste code, don't send follow-up instructions.
   - **Time limit: 20 minutes** per task. If it's still going, stop the session and note "timeout".
   - If it wants to **push, open a PR, merge or touch anything outside the folder, decline.**
5. When it finishes, record in `D:\AlanBench\alan_results.csv` on that task's row:
   - `routed_model`: the model from the UI text **"Auto Router sent this prompt to …"** (or the routed-model badge).
     If several prompts were routed differently, list them separated by `|`.
   - `minutes`: wall-clock minutes from sending the prompt to the agent finishing (one decimal is fine).
   - `notes`: short and factual, e.g. "ran pytest itself, said all pass", "asked 1 question", "timeout",
     "edited test file", "error: …".
6. Take one screenshot of the finished session showing the routed model and the end of the conversation, and save it
   as `D:\AlanAI\bench\alan_evidence\NN_<task>.png` (e.g. `07_lru_cache.png`).
7. **Don't run the tests yourself and don't edit anything in the folder.** The scorer checks the folder as the agent
   left it.

### Step C: capture usage AFTER
1. Same view as step A. Screenshot `D:\AlanAI\bench\alan_evidence\usage_after.png` and transcribe
   `D:\AlanAI\bench\alan_evidence\usage_after.json` in the same format.
2. Compute the **difference** (after − before) per model and write `D:\AlanAI\bench\alan_tokens_raw.json`:
   `{"<model name exactly as shown>": {"input": dIn, "output": dOut, "total": dTotal}}`.
3. **Only if you're confident** of the exact OpenRouter model id for a model (e.g. Alan shows "Claude Sonnet 4.5"
   → `anthropic/claude-sonnet-4.5`), also write `D:\AlanAI\bench\alan_tokens.json` with OpenRouter ids as keys and
   `{"input": dIn, "output": dOut}` values. If unsure about any model, **don't write this file.** The other session
   will map names. Never guess numbers.

### Step D (optional, only if A–C are done): Alan + Pennywise MCP demo
This shows Pennywise working *inside* Alan, for the demo video.
1. In Alan, go to the **MCP** area → **Add custom connector** → URL `http://127.0.0.1:8765/mcp` (name: `pennywise`).
2. Start a new local session (any agent that can use connectors) and send:
   `Use the pennywise "route" tool to decide which model tier this request needs: "Summarise the difference between a process and a thread in two sentences." Then report the tier and confidence it returned.`
3. Screenshot the result as `D:\AlanAI\bench\alan_evidence\mcp_demo.png` and note in the report whether the tool
   call worked (and any error text verbatim).

---

## 4. Things you must NOT do
- Don't edit, create or delete files inside `D:\AlanBench\NN_*` folders yourself (only Alan's agent may).
- Don't touch `D:\AlanAI` except to write the deliverables listed below.
- Don't merge, push, open PRs, connect new GitHub repos, buy credits, change plans or billing, invite members, or
  change org/model settings (whitelists, defaults). If Alan blocks a step without one of these, stop and report it.
- Don't read or copy credentials, tokens or keys.
- Don't stop background processes or terminals; don't restart the PC.
- Don't retry a task to get a better result: **one attempt per task**. (If the app itself crashes before the agent
  starts, one fresh restart of that task is OK; note it.)

---

## 5. Deliverables (write exactly these)
| File | Content |
|---|---|
| `D:\AlanBench\alan_results.csv` | filled rows for all 10 tasks |
| `D:\AlanAI\bench\alan_evidence\usage_before.png` / `.json` | usage by model before |
| `D:\AlanAI\bench\alan_evidence\usage_after.png` / `.json` | usage by model after |
| `D:\AlanAI\bench\alan_evidence\NN_<task>.png` | one screenshot per task |
| `D:\AlanAI\bench\alan_tokens_raw.json` | per-model token difference, model names as shown |
| `D:\AlanAI\bench\alan_tokens.json` | *only if confident*: same, keyed by OpenRouter id |
| `D:\AlanAI\bench\alan_evidence\mcp_demo.png` | optional step D |
| **`D:\AlanAI\bench\ALAN_RUN_REPORT.md`** | your report (below) |

**`ALAN_RUN_REPORT.md` must contain:**
1. Date and time range of the run, and the Alan app version if visible.
2. A table: task, routed model(s), minutes, what the agent said at the end (one line), anything odd.
3. Where the usage-by-model view was, and whether before/after numbers were captured (or why not).
4. Any deviation from this brief (and why), any permission prompts you approved, anything you declined.
5. Step D outcome, if done.
6. Anything else the owner should know (UI wording, limits hit, errors, verbatim messages).

When finished, the owner will tell the other session "score the benchmark". It runs
`python bench/score.py --alan D:/AlanBench`, which checks every folder's tests and test-file integrity and builds the
side-by-side table. You don't need to run it.
