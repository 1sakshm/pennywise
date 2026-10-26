---
name: laya-router
description: Send bounded sub-tasks (summaries, classifications, quick lookups, small self-contained edits) through the RL-trained Laya model router so they run on the cheapest model tier that will still get them right, and keep your main model for the hard work. Use when you are about to spend main-model tokens on a well-scoped side task whose answer you can check.
---

# Laya router skill

You have access to an OpenAI-compatible endpoint that routes each request to a small, medium or large open model. An RL-trained decision model (Laya) picks the cheapest tier it expects to answer correctly.

## When to use it
Use it for **bounded** sub-tasks: one input, one checkable output.
- Summarising a file, diff, log or error message
- Classifying something, e.g. "is this failure flaky or a real bug?", "which module owns this?"
- Short factual or API questions
- Small self-contained edits whose result you will check yourself, e.g. a regex, a docstring, a one-function fix with a test

Do **not** use it for planning, multi-file reasoning, or anything that needs your conversation context. Keep those on your main model.

## How
Run the helper and read its JSON output:

```bash
python scripts/route_task.py "Summarise this stack trace in one sentence: ..."           # mode auto
python scripts/route_task.py --mode auto-cheap "Classify: ..."                           # cheaper
python scripts/route_task.py --mode auto-quality "..."                                   # more careful
python scripts/route_task.py --route-only "..."                                          # just ask which tier, no LLM call
```

The output fields are `answer`, `tier`, `confidence` and `estimated_savings_usd`. **Verify the answer the same way you would verify a junior colleague's.** If it's wrong, redo the task yourself and don't retry the same prompt with a higher mode in a loop.

## Configuration
`LAYA_ROUTER_URL` is the proxy base URL, without `/v1`. If the endpoint is unreachable, the helper exits non-zero with an error message; in that case, do the task with your main model.
