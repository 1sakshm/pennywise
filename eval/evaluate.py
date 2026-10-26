"""Phase 6: metrics with bootstrap 95% CIs, Pareto frontier, per-source breakdown, findings.

Reads RESULTS/baselines.json, sft.json, rl_lam*.json; writes RESULTS/all.json and
RESULTS/summary.md (the summary is generated from all.json, so they always match).
Usage: python -m eval.evaluate
"""
import glob
import json
import sys

import numpy as np
import yaml

from router.data import load_table
from router.paths import RESULTS, ROOT, SYNTHETIC

CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
B, SEED = CFG["eval"]["bootstrap"], CFG["seed"]
TIERS = ["small", "medium", "large"]


def boot(tab, rows, actions, idx):
    """Point estimates + 95% percentile CIs over the shared bootstrap resamples `idx`."""
    c = tab.correct[rows, actions].astype(float)
    k = tab.cost[rows, actions]
    kl = tab.cost[rows, 2]
    acc, cost, rel = c[idx].mean(1), k[idx].mean(1), k[idx].mean(1) / kl[idx].mean(1)
    ci = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]  # noqa: E731
    return {"accuracy": float(c.mean()), "accuracy_ci": ci(acc),
            "mean_cost_usd": float(k.mean()), "mean_cost_ci": ci(cost),
            "cost_vs_large": float(k.mean() / kl.mean()), "cost_vs_large_ci": ci(rel)}


def paired_diff(tab, rows, a1, a2, idx):
    """Bootstrap CI of accuracy(a1) - accuracy(a2) on the same resamples."""
    d = tab.correct[rows, a1].astype(float) - tab.correct[rows, a2].astype(float)
    v = d[idx].mean(1)
    return {"diff": float(d.mean()), "ci": [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]}


def pareto(points):
    """Indices of non-dominated points (lower cost, higher accuracy)."""
    keep = []
    for i, p in enumerate(points):
        dominated = any(q["mean_cost_usd"] <= p["mean_cost_usd"] and q["accuracy"] >= p["accuracy"]
                        and (q["mean_cost_usd"] < p["mean_cost_usd"] or q["accuracy"] > p["accuracy"])
                        for j, q in enumerate(points) if j != i)
        if not dominated:
            keep.append(i)
    return keep


def by_source(tab, rows, actions):
    out = {}
    for s in sorted(set(tab.source[rows])):
        m = tab.source[rows] == s
        r, a = rows[m], np.asarray(actions)[m]
        out[s] = {"n": int(m.sum()), "accuracy": float(tab.correct[r, a].mean()),
                  "cost_vs_large": float(tab.cost[r, a].sum() / tab.cost[r, 2].sum())}
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # summary has ✓ and λ; Windows consoles/log redirects default to cp1252
    tab = load_table()
    te = tab.idx("test")
    pos = {i: k for k, i in enumerate(tab.ids[te])}
    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, len(te), size=(B, len(te)))

    def align(ids, actions):
        a = np.full(len(te), -1)
        for i, x in zip(ids, actions):
            a[pos[i]] = x
        assert (a >= 0).all(), "policy is missing test prompts"
        return a

    base = json.load(open(RESULTS / "baselines.json"))
    pols = []
    for p in base["policies"]:
        pols.append({"name": p["name"], "kind": p["kind"], "lambda": p.get("lambda"),
                     "router_latency_ms": p["router_latency_ms"], "actions": align(base["test_ids"], p["actions"])})
    if (RESULTS / "sft.json").exists():
        s = json.load(open(RESULTS / "sft.json"))
        pols.append({"name": "SFT Laya", "kind": "laya", "lambda": None, "router_latency_ms": None,
                     "actions": align(s["test_ids"], s["test_actions"])})
    for f in sorted(glob.glob(str(RESULTS / "rl_lam*.json")), key=lambda f: json.load(open(f))["lambda"]):
        r = json.load(open(f))
        pols.append({"name": "RL Laya", "kind": "rl", "lambda": r["lambda"], "router_latency_ms": None,
                     "actions": align(r["test_ids"], r["test_actions"])})
    zs_lat = next(p["router_latency_ms"] for p in pols if p["name"] == "zero-shot Laya")
    for p in pols:  # fine-tuned Laya has the same architecture and input as zero-shot
        if p["kind"] in ("rl",) or p["name"] == "SFT Laya":
            p["router_latency_ms"] = zs_lat

    large = next(p for p in pols if p["name"] == "always-large")["actions"]
    results = []
    for p in pols:
        a = p["actions"]
        rec = {k: v for k, v in p.items() if k != "actions"}
        rec.update(boot(tab, te, a, idx))
        rec["action_share"] = (np.bincount(a, minlength=3) / len(a)).round(4).tolist()
        rec["vs_always_large_acc"] = paired_diff(tab, te, a, large, idx)
        rec["by_source"] = by_source(tab, te, a)
        if p["lambda"] is not None:
            rec["mean_reward"] = float(tab.reward(a, p["lambda"], te).mean())
        rec["actions"] = a.tolist()
        results.append(rec)

    candidates = [r for r in results if r["kind"] != "oracle"]
    front = pareto(candidates)
    for i, r in enumerate(candidates):
        r["on_pareto_front"] = i in front

    out = {"synthetic": SYNTHETIC, "n_test": int(len(te)), "bootstrap": B, "seed": SEED,
           "cost_ref_usd": tab.cost_ref, "jev": base["jev"], "test_ids": tab.ids[te].tolist(),
           "test_source": tab.source[te].tolist(), "modes": choose_modes(val_results(tab)),
           "modes_selected_on": "val", "policies": results}
    json.dump(out, open(RESULTS / "all.json", "w"), indent=1)
    write_summary(out)
    print((RESULTS / "summary.md").read_text(encoding="utf-8"))


def val_results(tab):
    """RL policies + always-medium/large scored on the *val* split (used only for choose_modes)."""
    va = tab.idx("val")
    pos = {i: k for k, i in enumerate(tab.ids[va])}
    idx = np.random.default_rng(SEED + 1).integers(0, len(va), size=(B, len(va)))
    out = []
    for f in glob.glob(str(RESULTS / "rl_lam*.json")):
        r = json.load(open(f))
        a = np.full(len(va), -1)
        for i, x in zip(r["val_ids"], r["val_actions"]):
            a[pos[i]] = x
        rec = {"name": "RL Laya", "kind": "rl", "lambda": r["lambda"], **boot(tab, va, a, idx)}
        rec["vs_always_large_acc"] = paired_diff(tab, va, a, np.full(len(va), 2), idx)
        out.append(rec)
    for t, name in ((1, "always-medium"), (2, "always-large")):
        out.append({"name": name, "kind": "trivial", "lambda": None, **boot(tab, va, np.full(len(va), t), idx)})
    return out


def choose_modes(results):
    """Map proxy modes to a trained lambda with fixed rules, applied to VAL-split results
    (never test; documented in DECISIONS.md):
    auto         = cheapest RL policy whose accuracy is not significantly below always-large
                   (fallback: the lambda closest to 0.25)
    auto-quality = most accurate RL policy (ties -> cheaper)
    auto-cheap   = cheapest RL policy at least as accurate as always-medium (fallback: largest lambda)
    """
    rl = [r for r in results if r["kind"] == "rl"]
    if not rl:
        return None
    med = next(r for r in results if r["name"] == "always-medium")["accuracy"]
    tied = [r for r in rl if r["vs_always_large_acc"]["ci"][1] >= 0]
    auto = min(tied, key=lambda r: r["mean_cost_usd"]) if tied else min(rl, key=lambda r: abs(r["lambda"] - 0.25))
    quality = max(rl, key=lambda r: (r["accuracy"], -r["mean_cost_usd"]))
    ok = [r for r in rl if r["accuracy"] >= med]
    cheap = min(ok, key=lambda r: r["mean_cost_usd"]) if ok else max(rl, key=lambda r: r["lambda"])
    return {"auto": auto["lambda"], "auto-quality": quality["lambda"], "auto-cheap": cheap["lambda"]}


def fmt_ci(v, ci, pct=True):
    f = (lambda x: f"{100 * x:.1f}%") if pct else (lambda x: f"${x:.6f}")
    return f"{f(v)} [{f(ci[0])}, {f(ci[1])}]"


def label(r):
    return r["name"] + (f" (λ={r['lambda']:g})" if r["lambda"] is not None else "")


def write_summary(o):
    P = o["policies"]
    get = lambda n: next(r for r in P if r["name"] == n)  # noqa: E731
    large, rl = get("always-large"), [r for r in P if r["kind"] == "rl"]
    ptl = [r for r in P if r["kind"] == "correctness-predictor"]
    L = []
    if o["synthetic"]:
        L += ["> **SYNTHETIC DEV DATA — these numbers are fabricated for pipeline testing and must not be used anywhere.**", ""]
    L += [f"# Results summary (test split, n = {o['n_test']}, {o['bootstrap']} bootstrap resamples, seed {o['seed']})", "",
          "All numbers below are generated by `eval/evaluate.py` from `eval/results/all.json`.", "",
          "| Policy | Accuracy [95% CI] | Cost vs always-large [95% CI] | Mean $/request | Router ms | Share s/m/l | Pareto |",
          "|---|---|---|---|---|---|---|"]
    for r in P:
        L.append(f"| {label(r)} | {fmt_ci(r['accuracy'], r['accuracy_ci'])} | {fmt_ci(r['cost_vs_large'], r['cost_vs_large_ci'])} "
                 f"| ${r['mean_cost_usd']:.6f} | {'' if r['router_latency_ms'] is None else round(r['router_latency_ms'], 1)} "
                 f"| {'/'.join(f'{x:.2f}' for x in r['action_share'])} | {'✓' if r.get('on_pareto_front') else ''} |")
    L += ["", "## Findings", ""]
    if not rl:
        L.append("- RL policies not trained yet.")
    else:
        # RL policies whose accuracy is statistically indistinguishable from always-large (paired CI contains 0)
        tied = [r for r in rl if r["vs_always_large_acc"]["ci"][0] <= 0 <= r["vs_always_large_acc"]["ci"][1]]
        if tied:
            best = min(tied, key=lambda r: r["mean_cost_usd"])
            L.append(f"- Cheapest RL policy whose accuracy is not significantly different from always-large (paired bootstrap): "
                     f"**{label(best)}** — accuracy {fmt_ci(best['accuracy'], best['accuracy_ci'])} vs "
                     f"{100 * large['accuracy']:.1f}%, at **{100 * best['cost_vs_large']:.1f}%** of always-large cost "
                     f"(CI {100 * best['cost_vs_large_ci'][0]:.1f}–{100 * best['cost_vs_large_ci'][1]:.1f}%).")
        else:
            L.append("- No RL policy matched always-large accuracy within the paired 95% CI.")
        for r in rl:
            twin = next((p for p in ptl if p["lambda"] == r["lambda"] and "Laya" in p["name"]), None)
            if twin:
                d = r["accuracy"] - twin["accuracy"]
                L.append(f"- λ={r['lambda']:g}: RL Laya {100 * r['accuracy']:.1f}% @ {100 * r['cost_vs_large']:.1f}% cost vs "
                         f"per-tier LR (Laya-emb) {100 * twin['accuracy']:.1f}% @ {100 * twin['cost_vs_large']:.1f}% cost "
                         f"({'+' if d >= 0 else ''}{100 * d:.1f} pts accuracy).")
        front = [label(r) for r in P if r.get("on_pareto_front")]
        L.append(f"- Pareto-optimal policies (excluding oracle): {', '.join(front)}.")
        rl_front = sum(1 for r in rl if r.get("on_pareto_front"))
        L.append(f"- {rl_front}/{len(rl)} RL policies are on the Pareto front.")
        L += ["", "## Where the router loses", ""]
        for r in rl:
            losses = [(s, v["accuracy"] - large["by_source"][s]["accuracy"]) for s, v in r["by_source"].items()]
            worst = min(losses, key=lambda x: x[1])
            L.append(f"- λ={r['lambda']:g}: largest accuracy gap vs always-large is on **{worst[0]}** "
                     f"({100 * worst[1]:+.1f} pts, n={r['by_source'][worst[0]]['n']}).")
        L += ["", "## Alan-style agent slice (alan_bugfix + alan_triage), reported separately", "",
              "| Policy | bugfix acc | bugfix cost vs large | triage acc | triage cost vs large |", "|---|---|---|---|---|"]
        for r in [get("always-small"), get("always-large"), *rl]:
            b, t = r["by_source"].get("alan_bugfix"), r["by_source"].get("alan_triage")
            if b and t:
                L.append(f"| {label(r)} | {100 * b['accuracy']:.1f}% (n={b['n']}) | {100 * b['cost_vs_large']:.1f}% "
                         f"| {100 * t['accuracy']:.1f}% (n={t['n']}) | {100 * t['cost_vs_large']:.1f}% |")
    L += ["", f"Jev baseline: {o['jev']}.", "",
          "Caveats: small test set (see CIs); offline bandit on a full-information outcome table; benchmark prompts are "
          "not real production traffic; single seed."]
    (RESULTS / "summary.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
