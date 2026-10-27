"""Score the router benchmark: Pennywise (eval/results/router_bench_pennywise.json) vs. Alan Code Auto Router
(task folders edited by Alan, plus the routed model / minutes you noted in alan_results.csv, plus optional
per-model token counts from Alan's Team usage page for list-price cost).

    python bench/score.py --alan D:/AlanBench [--alan-tokens bench/alan_tokens.json]

alan_tokens.json (optional): {"<model id as shown by Alan>": {"input": N, "output": M}, ...} — the token DELTA
for the benchmark (usage page totals after minus before). Prices come from OpenRouter's public list.
Writes eval/results/router_bench.json and prints a summary table.
"""
import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
from tasks import ORIGINAL_TESTS, TASKS  # noqa: E402


def score_folder(d, task):
    """Untouched = the folder's test file is the current or the original (v1.0) version. Pass = the agent's code
    passes the CURRENT canonical tests, run on a copy, so every arm is judged by the same corrected suite."""
    import shutil
    import tempfile
    tests = {n: src for n, src in TASKS[task]["files"].items() if n.startswith("test_")}
    allowed = lambda n: {tests[n], (ORIGINAL_TESTS.get(task) or {}).get(n)}  # noqa: E731
    untouched = all((d / n).exists() and (d / n).read_text(encoding="utf-8") in allowed(n) for n in tests)
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(d, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        for n, src in tests.items():
            Path(tmp, n).write_text(src, encoding="utf-8")
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=tmp, capture_output=True, text=True)
    return {"tests_pass": r.returncode == 0, "tests_untouched": untouched, "merged": r.returncode == 0 and untouched}


def openrouter_prices():
    try:
        import httpx
        data = httpx.get("https://openrouter.ai/api/v1/models", timeout=30).json()["data"]
        return {m["id"]: (float(m["pricing"]["prompt"]) * 1e6, float(m["pricing"]["completion"]) * 1e6,
                          float(m["pricing"].get("input_cache_read") or m["pricing"]["prompt"]) * 1e6) for m in data}
    except Exception as e:  # offline: cost left blank, never guessed
        print("price lookup failed:", e)
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alan", default="D:/AlanBench")
    ap.add_argument("--alan-tokens", default=str(ROOT / "bench" / "alan_tokens.json"))
    a = ap.parse_args()
    root = Path(a.alan)
    sheet = {r["task"]: r for r in csv.DictReader(open(root / "alan_results.csv", encoding="utf-8"))} if (root / "alan_results.csv").exists() else {}
    alan = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        task = d.name.split("_", 1)[1]
        if task in TASKS:
            s = sheet.get(task, {})
            alan.append({"task": task, "level": TASKS[task]["level"], "arm": "alan/auto-router", **score_folder(d, task),
                         "routed_model": s.get("routed_model") or None, "minutes": float(s["minutes"]) if s.get("minutes") else None})
    pw = json.load(open(ROOT / "eval" / "results" / "router_bench_pennywise.json", encoding="utf-8"))["runs"]

    alan_cost = None
    tok_path = Path(a.alan_tokens)
    if tok_path.exists():
        toks, prices = json.load(open(tok_path, encoding="utf-8")), openrouter_prices()
        missing = [m for m in toks if not m.startswith("_") and m not in prices]
        if not missing:
            # cached input tokens (if reported) are priced at the provider's cache-read rate
            alan_cost = sum((v["input"] * prices[m][0] + v["output"] * prices[m][1] + v.get("cached", 0) * prices[m][2]) / 1e6
                            for m, v in toks.items() if not m.startswith("_"))
        else:
            print("no public list price for:", missing, "— Alan cost left blank")

    def summary(rows, cost=None, minutes=None):
        n, ok = len(rows), sum(r["merged"] for r in rows)
        by = {lv: f"{sum(r['merged'] for r in rows if r['level'] == lv)}/{sum(1 for r in rows if r['level'] == lv)}" for lv in ("easy", "medium", "hard")}
        return {"tasks": n, "merged": ok, "by_level": by, "total_cost_usd": cost,
                "usd_per_merged_pr": (cost / ok) if (cost is not None and ok) else None, "total_minutes": minutes}

    out = {"pennywise/auto": summary([r for r in pw if r["arm"] == "pennywise/auto"],
                                     sum(r["cost_usd"] for r in pw if r["arm"] == "pennywise/auto"),
                                     round(sum(r["wall_s"] for r in pw if r["arm"] == "pennywise/auto") / 60, 1)),
           "alan/auto-router": summary(alan, alan_cost, round(sum(r["minutes"] for r in alan if r["minutes"]), 1) if any(r["minutes"] for r in alan) else None)}
    day = ROOT / "eval" / "results" / "router_bench_pennywise_day.json"
    if day.exists():  # independent repeat of the auto arm in daytime (all 10 tasks, not just failures)
        rows = [r for r in json.load(open(day, encoding="utf-8"))["runs"] if r["arm"] == "pennywise/auto"]
        out["pennywise/auto (repeat, day)"] = summary(rows, sum(r["cost_usd"] for r in rows), round(sum(r["wall_s"] for r in rows) / 60, 1))
    cas = ROOT / "eval" / "results" / "router_bench_pennywise_cascade.json"
    if cas.exists():  # v0.2: same router + tool-call cascade in the proxy (escalate to top tier on a broken tool call)
        rows = [r for r in json.load(open(cas, encoding="utf-8"))["runs"] if r["arm"] == "pennywise/auto"]
        out["pennywise/auto + cascade (v0.2)"] = summary(rows, sum(r["cost_usd"] for r in rows), round(sum(r["wall_s"] for r in rows) / 60, 1))
    cas2 = ROOT / "eval" / "results" / "router_bench_pennywise_cascade2.json"
    if cas2.exists():  # v0.2b: cascade also escalates on empty replies and in-stream upstream errors
        rows = [r for r in json.load(open(cas2, encoding="utf-8"))["runs"] if r["arm"] == "pennywise/auto"]
        out["pennywise/auto + cascade (v0.2b)"] = summary(rows, sum(r["cost_usd"] for r in rows), round(sum(r["wall_s"] for r in rows) / 60, 1))
    v03 = ROOT / "eval" / "results" / "router_bench_pennywise_v03.json"
    if v03.exists():  # v0.3: cascade escalates to the `escalate` tier (MiniMax M3.1 Flash) incl. a 30 s cheap-tier budget
        rows = [r for r in json.load(open(v03, encoding="utf-8"))["runs"] if r["arm"] == "pennywise/auto"]
        out["pennywise/auto + cascade->MiniMax (v0.3)"] = summary(rows, sum(r["cost_usd"] for r in rows), round(sum(r["wall_s"] for r in rows) / 60, 1))
    if any(r["arm"] == "pennywise/large" for r in pw):
        rows = [r for r in pw if r["arm"] == "pennywise/large"]
        out["pennywise/large (reference)"] = summary(rows, sum(r["cost_usd"] for r in rows), round(sum(r["wall_s"] for r in rows) / 60, 1))
    res = {"label": "Router benchmark, n = 10 agent coding tasks (easy/medium/hard). Small live comparison, not a benchmark suite. "
                    "Costs are list prices from measured tokens; the two routers use different model pools.",
           "summary": out, "alan_runs": alan, "pennywise_runs": pw}
    (ROOT / "eval" / "results" / "router_bench.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"{'arm':28s} {'merged':>7s} {'easy':>5s} {'med':>5s} {'hard':>5s} {'$ total':>9s} {'$/merged PR':>12s} {'minutes':>8s}")
    for k, v in out.items():
        c = "—" if v["total_cost_usd"] is None else f"{v['total_cost_usd']:.4f}"
        p = "—" if v["usd_per_merged_pr"] is None else f"{v['usd_per_merged_pr']:.4f}"
        print(f"{k:28s} {v['merged']:>3d}/{v['tasks']:<3d} {v['by_level']['easy']:>5s} {v['by_level']['medium']:>5s} {v['by_level']['hard']:>5s} {c:>9s} {p:>12s} {str(v['total_minutes']):>8s}")
    models = [r["routed_model"] for r in alan if r["routed_model"]]
    if models:
        print("Alan Auto Router picked:", {m: models.count(m) for m in set(models)})


if __name__ == "__main__":
    main()
