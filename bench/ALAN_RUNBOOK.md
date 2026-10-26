# Running the Alan side of the router benchmark

Goal: run the same 10 coding tasks through **Alan Code with Auto Router** that Pennywise runs, then score both
sides identically (tests pass + test file untouched = "merged").

## Before you start (2 min)
1. Open the Alan desktop app → **Team usage** page (Org Dashboard). Note the **tokens per model** shown now
   (input and output if both are shown). You'll subtract these at the end. A screenshot is fine.
2. The task folders are in `D:\AlanBench\01_off_by_one` … `10_csv_quotes` (made by `python bench/make_alan_tasks.py`).

## For each folder (01 → 10)
1. In Alan, start a **local** session on this computer, workspace = the task folder.
2. Agent: **Alan Code**, model: **Auto Router**.
3. Paste the contents of that folder's `TASK.md` as the prompt (it's one sentence). Send. Don't add hints.
4. Let it finish. Don't help it; if it asks a question, answer only "continue".
5. In `D:\AlanBench\alan_results.csv`, fill that task's row:
   - `routed_model`: the model in **"Auto Router sent this prompt to …"** (or the model badge on the session).
   - `minutes`: rough wall-clock time.
   - `notes`: anything odd (asked questions, gave up, edited the tests).
6. **Don't merge or push anything.** The scorer reads the folder as Alan left it.

## After all 10
1. Note the **Team usage** tokens per model again. Write the **difference** for each model into
   `D:\AlanAI\bench\alan_tokens.json`, e.g.
   ```json
   {"anthropic/claude-sonnet-4.5": {"input": 120000, "output": 9000}}
   ```
   Use the model id as OpenRouter lists it, so the public list price can be looked up. If you can't map a model, leave
   the file out; the scorer then reports pass rates without Alan's cost rather than guessing.
2. Tell Claude "score the benchmark", or run `python bench/score.py --alan D:/AlanBench`.

## Fairness notes (they go in the write-up)
- Same tasks, same prompt text, same pass criterion, no hints, one attempt each.
- The two routers choose from **different model pools**. Alan's are managed models; Pennywise uses three free open
  models. So this compares *systems* (router + its models), not routing logic alone.
- n = 10, one attempt each: a small live comparison, not a benchmark suite.
