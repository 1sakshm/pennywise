"""Phase 7: compact JSON for the frontend -> web/public/data/ (or data-synthetic/).

manifest.json  headline numbers, modes, lambdas, tier colors/order, synthetic flag, commit
prompts.json   test prompts: id, source, preview, per-tier correct + cost
umap.json      all prompts: id, split, source, 3D + 2D UMAP of *base* Laya embeddings (fixed)
training/<lam>.json  per checkpoint: step, rewards/acc/cost, per-prompt [action, prob] (umap order)
pareto.json    every policy + baseline with CIs
game.json      ~40 'Beat the Router' rounds
Usage: python -m eval.export_viz
"""
import json
import subprocess

import numpy as np
import yaml

from eval.features import load_features
from router.data import load_table
from router.paths import RESULTS, ROOT, SNAPSHOTS, SYNTHETIC, VIZ

CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
SEED = CFG["seed"]
TIERS = ["small", "medium", "large"]
MAX_SNAPSHOTS = 31


def dump(name, obj):
    p = VIZ / name
    p.parent.mkdir(parents=True, exist_ok=True)
    json.dump(obj, open(p, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    return p.stat().st_size


def commit_hash():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return None


def umap_coords(X):
    import umap
    from sklearn.preprocessing import StandardScaler
    Xs = StandardScaler().fit_transform(X)
    c3 = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.15, random_state=SEED).fit_transform(Xs)
    c2 = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.15, random_state=SEED).fit_transform(Xs)
    norm = lambda c: ((c - c.mean(0)) / np.abs(c - c.mean(0)).max()).round(4)  # noqa: E731  -> [-1, 1]
    return norm(c3), norm(c2)


def tier_models():
    """Tier -> model id and list price (for the site's spec sheet); test config when SYNTHETIC."""
    cfg = yaml.safe_load(open(ROOT / ("tests/models.mock.yaml" if SYNTHETIC else "config/models.yaml")))["tiers"]
    return {t: {"model": cfg[t]["model"], "price_in_per_m": cfg[t]["price_in_per_m"], "price_out_per_m": cfg[t]["price_out_per_m"]} for t in TIERS}


def main():
    tab = load_table()
    allr = json.load(open(RESULTS / "all.json"))
    modes = allr["modes"]
    te = tab.idx("test")
    sizes = {}

    # ---- prompts.json (test)
    sizes["prompts.json"] = dump("prompts.json", [{
        "id": tab.ids[i], "source": tab.source[i], "preview": tab.prompts[i][:160],
        "correct": tab.correct[i].astype(int).tolist(), "cost": tab.cost[i].round(7).tolist()} for i in te])

    # ---- umap.json (all prompts, fixed positions)
    feats = load_features()
    pos = {k: j for j, k in enumerate(feats["ids"])}
    fi = np.array([pos[i] for i in tab.ids])
    c3, c2 = umap_coords(feats["laya_emb"][fi])
    sizes["umap.json"] = dump("umap.json", {"ids": tab.ids.tolist(), "split": tab.split.tolist(),
                                            "source": tab.source.tolist(), "preview": [p[:120] for p in tab.prompts],
                                            "xyz": c3.tolist(), "xy": c2.tolist()})

    # ---- training/<lam>.json
    lambdas = []
    for f in sorted(SNAPSHOTS.glob("rl_lam*.json")):
        s = json.load(open(f))
        assert s["ids"] == tab.ids.tolist(), "snapshot prompt order differs from the outcome table"
        snaps = s["snapshots"]
        if len(snaps) > MAX_SNAPSHOTS:
            keep = np.unique(np.linspace(0, len(snaps) - 1, MAX_SNAPSHOTS).round().astype(int))
            snaps = [snaps[k] for k in keep]
        out = []
        for sn in snaps:
            P = np.array(sn["probs"])
            a = P.argmax(1)
            out.append({"step": sn["step"], "train_reward_ma": sn["train_reward_ma"],
                        **{sp: {k: round(v, 5) for k, v in sn[sp].items()} for sp in ("val", "test")},
                        "action": a.tolist(), "prob": P[np.arange(len(a)), a].round(2).tolist()})
        lam = s["lambda"]
        lambdas.append(lam)
        sizes[f"training/{lam:g}.json"] = dump(f"training/{lam:g}.json", {"lambda": lam, "checkpoints": out})

    # ---- pareto.json
    sizes["pareto.json"] = dump("pareto.json", [{
        k: p.get(k) for k in ("name", "kind", "lambda", "accuracy", "accuracy_ci", "cost_vs_large", "cost_vs_large_ci",
                              "mean_cost_usd", "router_latency_ms", "action_share", "on_pareto_front")} for p in allr["policies"]])

    # ---- router_actions.json: per-policy test actions, aligned with prompts.json (drives the particle hero)
    pick_pol = lambda n, lam=None: next((p for p in allr["policies"] if p["name"] == n and p.get("lambda") == lam), None)  # noqa: E731
    acts = {"always-large": pick_pol("always-large")["actions"], "zero-shot": pick_pol("zero-shot Laya")["actions"]}
    if pick_pol("SFT Laya"):
        acts["sft"] = pick_pol("SFT Laya")["actions"]
    acts["rl"] = {f"{p['lambda']:g}": p["actions"] for p in allr["policies"] if p["kind"] == "rl"}
    assert allr["test_ids"] == tab.ids[te].tolist()
    sizes["router_actions.json"] = dump("router_actions.json", acts)

    # ---- game.json: router = the `auto` policy; score = picking the oracle (cheapest correct) tier
    auto = json.load(open(RESULTS / f"rl_lam{modes['auto']:g}.json"))
    apos = {i: k for k, i in enumerate(auto["test_ids"])}
    oracle = tab.oracle()
    cand = [i for i in te if tab.correct[i].any()]  # skip prompts no tier solved
    rng = np.random.default_rng(SEED)
    right = [i for i in cand if auto["test_actions"][apos[tab.ids[i]]] == oracle[i]]
    wrong = [i for i in cand if auto["test_actions"][apos[tab.ids[i]]] != oracle[i]]
    n_wrong = min(len(wrong), 10)
    pick = list(rng.choice(right, min(len(right), 40 - n_wrong), replace=False)) + list(rng.choice(wrong, n_wrong, replace=False))
    rng.shuffle(pick)
    game = []
    for i in pick:
        k = apos[tab.ids[i]]
        a = auto["test_actions"][k]
        game.append({"id": tab.ids[i], "source": tab.source[i],
                     "prompt": tab.prompts[i][:280] + ("…" if len(tab.prompts[i]) > 280 else ""),
                     "oracle": TIERS[oracle[i]], "router": TIERS[a], "router_conf": round(auto["test_probs"][k][a], 2),
                     "correct": tab.correct[i].astype(int).tolist(), "cost": tab.cost[i].round(7).tolist()})
    sizes["game.json"] = dump("game.json", {"lambda": modes["auto"], "rounds": game,
                                            "router_right_share": round(sum(g["router"] == g["oracle"] for g in game) / len(game), 3)})

    # ---- manifest.json (headline numbers for the hero + savings-counter fallback)
    get = lambda n, lam=None: next(p for p in allr["policies"] if p["name"] == n and p.get("lambda") == lam)  # noqa: E731
    a_auto = get("RL Laya", modes["auto"])
    large = get("always-large")
    acts = np.array(auto["test_actions"])
    ids_order = np.array([apos[tab.ids[i]] for i in te])
    saved = float((tab.cost[te, 2] - tab.cost[te, acts[ids_order]]).sum())
    sizes["manifest.json"] = dump("manifest.json", {
        "synthetic": SYNTHETIC, "commit": commit_hash(), "seed": SEED, "tiers": TIERS, "lambdas": sorted(lambdas),
        "modes": modes, "n_test": allr["n_test"], "n_prompts": len(tab.ids), "jev": allr["jev"],
        "headline": {"lambda": modes["auto"], "accuracy": a_auto["accuracy"], "accuracy_ci": a_auto["accuracy_ci"],
                     "cost_vs_large": a_auto["cost_vs_large"], "cost_vs_large_ci": a_auto["cost_vs_large_ci"],
                     "large_accuracy": large["accuracy"], "router_latency_ms": a_auto["router_latency_ms"],
                     "medium_accuracy": get("always-medium")["accuracy"], "medium_cost_vs_large": get("always-medium")["cost_vs_large"],
                     "vs_large_diff": a_auto["vs_always_large_acc"]["diff"], "vs_large_ci": a_auto["vs_always_large_acc"]["ci"]},
        "measured_savings": {"usd": saved, "requests": int(len(te)), "label": "measured on the held-out test set"},
        "tier_models": tier_models()})

    tot = sum(sizes.values())
    for k, v in sizes.items():
        print(f"  {k:28s} {v / 1024:8.1f} KB")
    print(f"{'SYNTHETIC ' if SYNTHETIC else ''}viz export -> {VIZ.relative_to(ROOT)}  total {tot / 2**20:.2f} MB")
    if tot > 6 * 2**20:
        print("WARNING: export exceeds 6 MB budget")


if __name__ == "__main__":
    main()
