"""Export the agent-coding benchmark headline for the site: Pennywise (v0.2b: router + tool-call cascade)
vs. Alan Code's Auto Router on the same 10 tasks -> web/public/data/agent_bench.json.
Numbers come from eval/results/router_bench.json (bench/score.py); nothing is typed in by hand.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
res = json.load(open(ROOT / "eval" / "results" / "router_bench.json", encoding="utf-8"))
S = res["summary"]
pw, alan = S["pennywise/auto + cascade (v0.2b)"], S["alan/auto-router"]
out = {
    "tasks": pw["tasks"],
    "pennywise": {"label": "Pennywise (auto + tool-call cascade)", "merged": pw["merged"], "minutes": pw["total_minutes"], "by_level": pw["by_level"]},
    "alan": {"label": "Alan Code · Auto Router", "merged": alan["merged"], "minutes": alan["total_minutes"], "by_level": alan["by_level"],
             "routed_to": sorted({r["routed_model"] for r in res["alan_runs"] if r.get("routed_model")})},
    "speedup": round(alan["total_minutes"] / pw["total_minutes"], 1),
    "scope": f"{pw['tasks']} agent coding tasks (3 easy, 3 medium, 4 hard), unit-tested; one run each; OpenCode CLI for Pennywise, Alan desktop app for Auto Router; Oct 27, 2026.",
    "merged_means": "tests pass and the test file is unchanged",
}
# per-task timeline for the site's race replay (same runs as the summary)
import sys  # noqa: E402
sys.path.insert(0, str(ROOT / "bench"))
from tasks import TASKS  # noqa: E402
casc = {r["task"]: r for r in json.load(open(ROOT / "eval" / "results" / "router_bench_pennywise_cascade2.json", encoding="utf-8"))["runs"]}
alan_runs = {r["task"]: r for r in res["alan_runs"]}
out["per_task"] = [{"task": t, "level": TASKS[t]["level"],
                    "pennywise_min": round(casc[t]["wall_s"] / 60, 2), "pennywise_merged": casc[t]["merged"],
                    "alan_min": alan_runs[t]["minutes"], "alan_merged": alan_runs[t]["merged"]} for t in TASKS]
dest = ROOT / "web" / "public" / "data" / "agent_bench.json"
dest.write_text(json.dumps(out, indent=1), encoding="utf-8")
print(json.dumps(out, indent=1))
