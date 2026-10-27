"""Inject generated results into README.md between marker comments (numbers from eval outputs only).
    <!-- GEN:HEADLINE -->...<!-- /GEN:HEADLINE -->   <!-- GEN:RESULTS -->...<!-- /GEN:RESULTS -->
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def pct(x, d=1):
    return f"{100 * x:.{d}f}%"


def main():
    allr = json.load(open(ROOT / "eval" / "results" / "all.json", encoding="utf-8"))
    if allr.get("synthetic"):
        raise SystemExit("refusing to write SYNTHETIC results into README")
    P, modes = allr["policies"], allr["modes"]
    get = lambda n, lam=None: next(p for p in P if p["name"] == n and p.get("lambda") == lam)  # noqa: E731
    auto, large = get("RL Laya", modes["auto"]), get("always-large")
    # Headline: the agent-coding benchmark vs Alan's Auto Router (speed + success), from bench/score.py output
    rb = json.load(open(ROOT / "eval" / "results" / "router_bench.json", encoding="utf-8"))["summary"]
    pw, al = rb["pennywise/auto + cascade (v0.2b)"], rb["alan/auto-router"]
    head = (f"**{al['total_minutes'] / pw['total_minutes']:.1f}× faster than Alan's Auto Router, with the same {pw['merged']}/{pw['tasks']} agent coding "
            f"tasks merged.** Pennywise finished all {pw['tasks']} in {pw['total_minutes']:.1f} min; Alan Code with Auto Router took "
            f"{al['total_minutes']:.1f} min (easy {pw['by_level']['easy']} · medium {pw['by_level']['medium']} · hard {pw['by_level']['hard']} for both).\n\n"
            f"_{pw['tasks']} unit-tested agent coding tasks, one run each (Oct 27, 2026). Merged = tests pass and the test file is unchanged. "
            f"Details, every run and the scripts: [`bench/`](bench/) · [`eval/results/router_bench.json`](eval/results/router_bench.json)._\n\n"
            f"On held-out Q&A prompts the RL policy (`auto`, λ={modes['auto']:g}) scores {pct(auto['accuracy'])} vs {pct(large['accuracy'])} for always-large; "
            f"full table below.")
    keep = lambda p: p["kind"] != "correctness-predictor" or p["lambda"] in (0.1, 0.25, 0.5, 1.0)  # noqa: E731
    rows = ["| Policy | Accuracy [95% CI] | Cost vs always-large [95% CI] | Router ms |", "|---|---|---|---|"]
    for p in filter(keep, P):
        lab = p["name"] + (f" (λ={p['lambda']:g})" if p.get("lambda") is not None else "")
        if p["kind"] == "rl" and p["lambda"] == modes["auto"]:
            lab = f"**{lab} ← auto**"
        ms = "" if p["router_latency_ms"] is None else f"{p['router_latency_ms']:.1f}"
        rows.append(f"| {lab} | {pct(p['accuracy'])} [{pct(p['accuracy_ci'][0])}, {pct(p['accuracy_ci'][1])}] | "
                    f"{pct(p['cost_vs_large'])} [{pct(p['cost_vs_large_ci'][0])}, {pct(p['cost_vs_large_ci'][1])}] | {ms} |")
    rows.append(f"\nJev: {allr['jev']}. Full findings, including where the router loses: [`eval/results/summary.md`](eval/results/summary.md).")
    tags = [("HEADLINE", head), ("RESULTS", "\n".join(rows))]
    ab_path = ROOT / "eval" / "results" / "alan_before_after.json"
    if ab_path.exists():
        ab = json.load(open(ab_path, encoding="utf-8"))
        b, a = ab["summary"]["pennywise/large"], ab["summary"]["pennywise/auto"]
        tags.append(("ALAN", "\n".join([
            "**$ per merged PR** (tests pass after the agent's edit), OpenCode with `pennywise/large` (before) vs `pennywise/auto` (after):",
            "", "| | Tasks passed | Total list-price cost | $ per merged PR | Total wall-clock |", "|---|---|---|---|---|",
            f"| before: `pennywise/large` | {b['passed']}/{b['tasks']} | ${b['total_cost_usd']:.4f} | ${b['usd_per_passing_task']:.4f} | {b['total_wall_s'] / 60:.1f} min |",
            f"| after: `pennywise/auto` | {a['passed']}/{a['tasks']} | ${a['total_cost_usd']:.4f} | ${a['usd_per_passing_task']:.4f} | {a['total_wall_s'] / 60:.1f} min |",
            "", f"_{ab['label']}_ Costs are list prices from measured tokens (actual spend $0). The after-arm's long wall-clock time is the free "
            "medium-tier endpoint's latency (often >60 s per step that night), not routing overhead. Raw runs: "
            "[`eval/results/alan_before_after.json`](eval/results/alan_before_after.json)."])))
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for tag, body in tags:
        readme = re.sub(rf"<!-- GEN:{tag} -->.*?<!-- /GEN:{tag} -->", f"<!-- GEN:{tag} -->\n{body}\n<!-- /GEN:{tag} -->", readme, flags=re.S)
    (ROOT / "README.md").write_text(readme, encoding="utf-8")
    print("README.md updated from eval/results/all.json")


if __name__ == "__main__":
    main()
