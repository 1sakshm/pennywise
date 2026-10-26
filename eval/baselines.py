"""Phase 3: baselines on the test split -> RESULTS/baselines.json.

Policies: always-{small,medium,large}, random, oracle, zero-shot Laya, Jev (only if
JEV_API_KEY is set), and cheap embedding baselines on frozen base-Laya and MiniLM embeddings:
  - logistic regression / kNN predicting the oracle tier (C and k tuned on val)
  - per-tier correctness predictors: argmax_a P(correct|a) - lam * cost(a)/cost_ref, swept over
    the same lambda grid as RL.
Usage: python -m eval.baselines [--no-latency]
"""
import argparse
import json
import os
import time

import numpy as np
import yaml
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler

from eval.features import load_features
from router.data import load_table, metrics
from router.paths import RESULTS, ROOT, SYNTHETIC

CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
SEED, LAMBDAS = CFG["seed"], CFG["rl"]["lambdas"]
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0]
K_GRID = [1, 3, 5, 9, 15, 25, 41]


def entry(name, kind, tab, actions, rows, latency_ms=None, **extra):
    return {"name": name, "kind": kind, **metrics(tab, actions, rows), "router_latency_ms": latency_ms,
            "actions": np.asarray(actions).tolist(), **extra}


def fit_oracle_classifiers(X, tab, tr, va, te):
    y = tab.oracle()
    sc = StandardScaler().fit(X[tr])
    Xs = sc.transform(X)
    best = max(C_GRID, key=lambda C: LogisticRegression(C=C, max_iter=3000, random_state=SEED)
               .fit(Xs[tr], y[tr]).score(Xs[va], y[va]))
    lr = LogisticRegression(C=best, max_iter=3000, random_state=SEED).fit(Xs[tr], y[tr])
    k = max(K_GRID, key=lambda k: KNeighborsClassifier(k).fit(Xs[tr], y[tr]).score(Xs[va], y[va]))
    knn = KNeighborsClassifier(k).fit(Xs[tr], y[tr])
    return lr.predict(Xs[te]), {"C": best}, knn.predict(Xs[te]), {"k": k}


def per_tier_correctness(X, tab, tr, va, te):
    """One LR per tier for P(correct|prompt,tier); C per tier chosen by val log-loss."""
    sc = StandardScaler().fit(X[tr])
    Xs = sc.transform(X)
    P, Cs = np.zeros((len(X), 3)), []
    for t in range(3):
        y = tab.correct[:, t]
        if y[tr].all() or not y[tr].any():
            P[:, t] = y[tr].mean()
            Cs.append(None)
            continue

        def val_ll(C):
            p = LogisticRegression(C=C, max_iter=3000, random_state=SEED).fit(Xs[tr], y[tr]).predict_proba(Xs[va])[:, 1]
            p = p.clip(1e-6, 1 - 1e-6)
            return -np.mean(y[va] * np.log(p) + (1 - y[va]) * np.log(1 - p))
        C = min(C_GRID, key=val_ll)
        P[:, t] = LogisticRegression(C=C, max_iter=3000, random_state=SEED).fit(Xs[tr], y[tr]).predict_proba(Xs)[:, 1]
        Cs.append(C)
    tier_cost = tab.cost[tr].mean(0) / tab.cost_ref  # expected cost per tier, known before calling
    curve = {lam: (P[te] - lam * tier_cost[None, :]).argmax(1) for lam in LAMBDAS}
    return curve, {"C_per_tier": Cs, "tier_cost_norm": tier_cost.round(4).tolist()}


def measure_latency(kind, prompts):
    """Single-request router latency (ms, median) for the embedding baselines."""
    import torch
    if kind == "laya":
        from router.laya_model import LayaPolicy
        m = LayaPolicy()
        fn = m.embed
    else:
        from sentence_transformers import SentenceTransformer
        st = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cuda" if torch.cuda.is_available() else "cpu")
        fn = lambda p: st.encode([p])  # noqa: E731
    fn(prompts[0])
    ts = []
    for p in prompts:
        t0 = time.perf_counter()
        fn(p)
        ts.append((time.perf_counter() - t0) * 1000)
    return float(np.median(ts))


def main(a):
    tab = load_table()
    feats = load_features()
    pos = {i: k for k, i in enumerate(feats["ids"])}
    fi = np.array([pos[i] for i in tab.ids])
    tr, va, te = tab.idx("train"), tab.idx("val"), tab.idx("test")
    rng = np.random.default_rng(SEED)
    res = []

    for t, name in enumerate(["small", "medium", "large"]):
        res.append(entry(f"always-{name}", "trivial", tab, np.full(len(te), t), te, 0.0))
    res.append(entry("random", "trivial", tab, rng.integers(0, 3, len(te)), te, 0.0))
    res.append(entry("oracle", "oracle", tab, tab.oracle()[te], te, None))
    zs = feats["zeroshot_probs"][fi]
    res.append(entry("zero-shot Laya", "laya", tab, zs[te].argmax(1), te,
                     float(np.median(feats["zeroshot_ms"][fi][te]))))

    lat = {}
    if not a.no_latency:
        sample = [tab.prompts[i] for i in te[:50]]
        lat = {k: measure_latency(k, sample) for k in ("laya", "st")}
    for key, label in [("laya_emb", "Laya-emb"), ("st_emb", "MiniLM-emb")]:
        X = feats[key][fi]
        L = lat.get("laya" if key == "laya_emb" else "st")
        lr_a, lr_hp, knn_a, knn_hp = fit_oracle_classifiers(X, tab, tr, va, te)
        res.append(entry(f"LR ({label})", "embedding", tab, lr_a, te, L, hparams=lr_hp))
        res.append(entry(f"kNN ({label})", "embedding", tab, knn_a, te, L, hparams=knn_hp))
        curve, hp = per_tier_correctness(X, tab, tr, va, te)
        for lam, acts in curve.items():
            res.append(entry(f"per-tier LR ({label})", "correctness-predictor", tab, acts, te, L, **{"lambda": lam}, hparams=hp))

    jev = "JEV_API_KEY set but Jev client not implemented" if os.environ.get("JEV_API_KEY") else "not run (no JEV_API_KEY)"
    out = {"split": "test", "n_test": int(len(te)), "seed": SEED, "cost_ref_usd": tab.cost_ref,
           "synthetic": SYNTHETIC, "jev": jev, "test_ids": tab.ids[te].tolist(), "policies": res}
    path = RESULTS / "baselines.json"
    json.dump(out, open(path, "w"), indent=1)

    print(f"{'SYNTHETIC DATA - ' if SYNTHETIC else ''}test n={len(te)}, cost_ref=${tab.cost_ref:.6f}, Jev: {jev}")
    print(f"{'policy':34s} {'lam':>5s} {'acc':>7s} {'$/req':>10s} {'vs large':>9s} {'lat ms':>7s}  share s/m/l")
    for r in res:
        lam = r.get("lambda")
        print(f"{r['name']:34s} {'' if lam is None else lam:>5} {r['accuracy']:7.3f} {r['mean_cost_usd']:10.6f} "
              f"{r['cost_vs_large']:9.3f} {'' if r['router_latency_ms'] is None else round(r['router_latency_ms'],1):>7}  "
              f"{'/'.join(f'{x:.2f}' for x in r['action_share'])}")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-latency", action="store_true")
    main(ap.parse_args())
