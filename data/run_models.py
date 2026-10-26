"""Run every prompt on every tier; grade; cache to data/processed/outcomes.jsonl.

Resumable: results are appended one line per (prompt_id, tier) and already-finished
pairs are skipped on restart. Stops launching new calls once spend exceeds the budget.
Usage: python data/run_models.py [--tiers small,medium,large] [--limit N] [--budget 12]
"""
import argparse
import asyncio
import json
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.graders import grade  # noqa: E402
from router.models import cost_usd, load_tiers, make_client  # noqa: E402

PROMPTS = ROOT / "data" / "processed" / "prompts.jsonl"
OUT = ROOT / "data" / "processed" / "outcomes.jsonl"

SYSTEM = {
    "gsm8k": "Solve the math problem. Think step by step, then end with a final line of the form 'Answer: <number>'.",
    "arc": "Answer the multiple-choice science question. Reason briefly, then end with a final line of the form 'Answer: <letter>'.",
    "mbpp": "Write a correct Python function for the task. Return only the code in a single ```python block.",
    "alan_bugfix": "You are a coding agent fixing a bug. Return only the full corrected function in a single ```python block.",
    "alan_triage": "You are a coding agent triaging a CI failure. Reason briefly, then end with a final line of the form 'Answer: <label>'.",
}


def load_done():
    done, spend = set(), 0.0
    if OUT.exists():
        for line in open(OUT, encoding="utf-8"):
            r = json.loads(line)
            done.add((r["prompt_id"], r["tier"]))
            spend += r["cost_usd"]
    return done, spend


async def call(tier_name, tier, client, rec, gen, sem, state, lock, fout):
    async with sem:
        if state["spend"] >= state["budget"]:
            state["skipped"] += 1
            return
        msgs = [{"role": "system", "content": SYSTEM[rec["source"]]}, {"role": "user", "content": rec["prompt"]}]
        for attempt in range(gen["max_retries"]):
            try:
                t0 = time.perf_counter()
                resp = await client.chat.completions.create(
                    model=tier["model"], messages=msgs, temperature=gen["temperature"],
                    max_tokens=gen["max_tokens"], timeout=gen["timeout_s"])
                latency = (time.perf_counter() - t0) * 1000
                break
            except Exception as e:  # noqa: BLE001 - retry anything transient
                wait = min(60, 2 ** attempt + random.random())
                print(f"  [{tier_name}] {rec['id']} attempt {attempt+1} failed: {type(e).__name__}: {str(e)[:120]} (retry in {wait:.0f}s)")
                await asyncio.sleep(wait)
        else:
            state["failed"] += 1
            return
        raw = resp.choices[0].message.content or ""
        u = resp.usage
        tin, tout = (u.prompt_tokens, u.completion_tokens) if u else (0, 0)
        c = cost_usd(tier, tin, tout)
        correct = await asyncio.to_thread(grade, rec, raw)
        row = {"prompt_id": rec["id"], "tier": tier_name, "source": rec["source"], "split": rec["split"],
               "correct": correct, "input_tokens": tin, "output_tokens": tout, "cost_usd": c,
               "latency_ms": round(latency, 1), "model": tier["model"], "raw_output": raw}
        async with lock:
            fout.write(json.dumps(row) + "\n")
            fout.flush()
            state["spend"] += c
            state["n"] += 1
            if state["n"] % 50 == 0:
                print(f"  {state['n']} calls done, spend ${state['spend']:.3f}", flush=True)


def summary():
    rows = [json.loads(l) for l in open(OUT, encoding="utf-8")]
    agg = defaultdict(lambda: [0, 0, 0.0])
    for r in rows:
        for key in [(r["source"], r["tier"]), ("ALL", r["tier"])]:
            a = agg[key]
            a[0] += 1
            a[1] += r["correct"]
            a[2] += r["cost_usd"]
    tiers = ["small", "medium", "large"]
    print(f"\n{'source':13s}" + "".join(f"{t:>24s}" for t in tiers))
    for src in sorted({k[0] for k in agg}, key=lambda s: (s == "ALL", s)):
        cells = []
        for t in tiers:
            n, c, cost = agg.get((src, t), [0, 0, 0.0])
            cells.append(f"{(c / n if n else 0):6.1%} n={n:<4d} ${cost:7.4f}")
        print(f"{src:13s}" + "".join(f"{c:>24s}" for c in cells))
    print(f"\ntotal spend: ${sum(r['cost_usd'] for r in rows):.4f} over {len(rows)} calls")
    acc = {t: agg[("ALL", t)][1] / max(1, agg[("ALL", t)][0]) for t in tiers}
    if max(acc.values()) - min(acc.values()) < 0.05:
        print("WARNING: tiers differ by <5 points overall; the routing problem may be trivial. Consider harder prompts.")


async def main(args):
    tiers = load_tiers()
    gen = tiers.pop("_generation")
    use = args.tiers.split(",")
    recs = [json.loads(l) for l in open(PROMPTS, encoding="utf-8")]
    if args.limit:
        recs = recs[: args.limit]
    done, spend = load_done()
    state = {"spend": spend, "budget": args.budget, "n": 0, "failed": 0, "skipped": 0}
    print(f"{len(recs)} prompts x {use}; {len(done)} cached; spend so far ${spend:.4f}; budget ${args.budget}")
    sem, lock = asyncio.Semaphore(args.concurrency or gen["concurrency"]), asyncio.Lock()
    with open(OUT, "a", encoding="utf-8") as fout:
        jobs = [call(t, tiers[t], make_client(tiers[t], async_=True), r, gen, sem, state, lock, fout)
                for t in use for r in recs if (r["id"], t) not in done]
        await asyncio.gather(*jobs)
    print(f"finished: {state['n']} new calls, {state['failed']} failed, {state['skipped']} skipped (budget)")
    if state["skipped"]:
        print(f"WARNING: budget ${args.budget} reached; {state['skipped']} calls not made. Raise --budget to continue.")
    summary()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiers", default="small,medium,large")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--concurrency", type=int, default=0)
    ap.add_argument("--budget", type=float, default=float(os.environ.get("DATASET_BUDGET_USD", 12)))
    ap.add_argument("--summary", action="store_true", help="only print the summary table")
    a = ap.parse_args()
    summary() if a.summary else asyncio.run(main(a))
