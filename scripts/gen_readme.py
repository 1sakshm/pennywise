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
    med = get("always-medium")
    d = auto["vs_always_large_acc"]
    head = (f"**{pct(auto['accuracy'])} accuracy at {pct(auto['cost_vs_large'])} of the cost of always calling the largest model** "
            f"(always-large: {pct(large['accuracy'])}) on {allr['n_test']} held-out prompts. Paired accuracy difference vs always-large "
            f"{100 * d['diff']:+.1f} pts (95% CI {100 * d['ci'][0]:+.1f} to {100 * d['ci'][1]:+.1f}); cost CI "
            f"{pct(auto['cost_vs_large_ci'][0])}–{pct(auto['cost_vs_large_ci'][1])}; `auto` mode, λ={modes['auto']:g} chosen on validation.\n\n"
            f"Honest reading: the trained policies send ~{pct(auto['action_share'][1], 0)} of requests to the medium tier, so `auto` is close to the "
            f"trivial always-medium baseline ({pct(med['accuracy'])} at {pct(med['cost_vs_large'])}). RL found the right default tier from bandit feedback, "
            f"but does not yet reliably spot the prompts that need the large tier.")
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
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for tag, body in (("HEADLINE", head), ("RESULTS", "\n".join(rows))):
        readme = re.sub(rf"<!-- GEN:{tag} -->.*?<!-- /GEN:{tag} -->", f"<!-- GEN:{tag} -->\n{body}\n<!-- /GEN:{tag} -->", readme, flags=re.S)
    (ROOT / "README.md").write_text(readme, encoding="utf-8")
    print("README.md updated from eval/results/all.json")


if __name__ == "__main__":
    main()
