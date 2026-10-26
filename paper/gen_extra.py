"""Extra figures, tables and numbers for the report — all computed from data/processed/outcomes.jsonl,
eval/results/* and config/*.yaml. Called by gen_tables.main(); writes <out>/generated/extra.typ and
<out>/figures/*.pdf. Works on partial RL results (DRAFT=1): every RL figure uses whatever
rl_lam*.json files exist.
"""
import glob
import json
from collections import Counter

import matplotlib.pyplot as plt
import numpy as np
import yaml

from router.data import load_table
from router.models import TIER_NAMES, load_tiers
from router.paths import OUTCOMES, RESULTS, ROOT, SYNTHETIC

TC = {"small": "#0d9488", "medium": "#4f46e5", "large": "#db2777"}
TCL = [TC[t] for t in TIER_NAMES]
GOLD, INK, GREY = "#ca8a04", "#1f2937", "#9ca3af"
SRC_ORDER = ["gsm8k", "arc", "mbpp", "math", "mmlu_pro", "alan_bugfix", "alan_triage"]
SRC = {"math": "MATH L4–5", "mmlu_pro": "MMLU-Pro", "gsm8k": "GSM8K", "arc": "ARC-C", "mbpp": "MBPP", "alan_bugfix": "Agent bug-fix", "alan_triage": "Agent triage"}


def style():
    plt.rcParams.update({
        "font.family": "serif", "font.serif": ["STIXGeneral", "DejaVu Serif"], "mathtext.fontset": "stix",
        "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8, "xtick.labelsize": 7, "ytick.labelsize": 7, "legend.fontsize": 7,
        "axes.linewidth": 0.6, "xtick.major.width": 0.6, "ytick.major.width": 0.6, "xtick.major.size": 3, "ytick.major.size": 3,
        "xtick.direction": "in", "ytick.direction": "in", "xtick.top": True, "ytick.right": True,
        "axes.grid": True, "grid.linewidth": 0.4, "grid.alpha": 0.35, "grid.linestyle": ":",
        "legend.frameon": False, "savefig.bbox": "tight", "savefig.pad_inches": 0.02, "pdf.fonttype": 42,
        "axes.titleweight": "normal", "axes.titlelocation": "left",
    })


def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def p1(x):
    return f"{100 * x:.1f}"


def _outcome_rows(tab):
    """Per (prompt, tier) token counts and latency for the current tier models."""
    models = {t: c["model"] for t, c in load_tiers().items() if t in TIER_NAMES}
    ids = set(tab.ids.tolist())
    rows = {}
    for line in open(OUTCOMES, encoding="utf-8"):
        o = json.loads(line)
        if o["prompt_id"] in ids and o.get("model") == models.get(o["tier"]):
            rows[(o["prompt_id"], o["tier"])] = o
    return rows


def _rl():
    out = [json.load(open(f, encoding="utf-8")) for f in glob.glob(str(RESULTS / "rl_lam*.json"))]
    return sorted(out, key=lambda r: r["lambda"])


# ---------------------------------------------------------------- figures
def fig_dataset(tab, FIG):
    fig, ax = plt.subplots(figsize=(7.0, 2.3))
    srcs = [s for s in SRC_ORDER if s in set(tab.source)] + ["ALL"]
    w = 0.26
    for j, t in enumerate(TIER_NAMES):
        ys, lo, hi = [], [], []
        for s in srcs:
            m = np.ones(len(tab.ids), bool) if s == "ALL" else tab.source == s
            k, n = int(tab.correct[m, j].sum()), int(m.sum())
            a, b = wilson(k, n)
            ys.append(k / n); lo.append(k / n - a); hi.append(b - k / n)
        x = np.arange(len(srcs)) + (j - 1) * w
        ax.bar(x, ys, w * 0.92, color=TC[t], alpha=0.85, label=t, lw=0)
        ax.errorbar(x, ys, yerr=[lo, hi], fmt="none", ecolor=INK, elinewidth=0.6, capsize=1.5, capthick=0.6)
    orc = [tab.correct[(np.ones(len(tab.ids), bool) if s == "ALL" else tab.source == s)].any(1).mean() for s in srcs]
    ax.scatter(np.arange(len(srcs)), orc, marker="_", s=260, color=INK, lw=1.2, label="any tier correct (oracle)", zorder=5)
    ax.set_xticks(np.arange(len(srcs)), [SRC.get(s, "All prompts") for s in srcs])
    ax.set_ylim(0.3, 1.04)
    ax.set_ylabel("accuracy (all splits)")
    ax.axvline(len(srcs) - 1.5, color=GREY, lw=0.6)
    ax.legend(ncol=4, loc="lower left", bbox_to_anchor=(0, 1.0))
    fig.savefig(FIG / "dataset_acc.pdf"); plt.close(fig)


def fig_patterns(tab, FIG):
    pats = Counter("".join("1" if c else "0" for c in row) for row in tab.correct)
    order = sorted(pats, key=lambda p: -pats[p])
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(3.35, 2.6), gridspec_kw={"height_ratios": [3, 1.3], "hspace": 0.05}, sharex=True)
    x = np.arange(len(order))
    ax.bar(x, [pats[p] for p in order], 0.6, color=INK, lw=0)
    for i, p in enumerate(order):
        ax.text(i, pats[p] + 6, str(pats[p]), ha="center", va="bottom", fontsize=6.5)
    ax.set_ylabel("prompts")
    ax.set_ylim(0, max(pats.values()) * 1.18)
    ax.grid(axis="x", visible=False)
    for j, t in enumerate(TIER_NAMES):
        for i, p in enumerate(order):
            on = p[j] == "1"
            bx.scatter(i, 2 - j, s=22, color=TC[t] if on else "#e5e7eb", zorder=3, lw=0)
        bx.text(-0.8, 2 - j, t, ha="right", va="center", fontsize=6.5, color=TC[t])
    for i, p in enumerate(order):
        on = [2 - j for j in range(3) if p[j] == "1"]
        if len(on) > 1:
            bx.plot([i, i], [min(on), max(on)], color=INK, lw=0.8, zorder=2)
    bx.set_ylim(-0.6, 2.6); bx.set_yticks([]); bx.set_xticks([]); bx.grid(False)
    for s in ("top", "right", "left", "bottom"):
        bx.spines[s].set_visible(False)
    fig.savefig(FIG / "patterns.pdf"); plt.close(fig)
    return pats


def fig_cost(tab, rows, FIG):
    fig, axs = plt.subplots(1, 3, figsize=(7.0, 1.9))
    for j, t in enumerate(TIER_NAMES):
        out_tok = np.array([rows[(i, t)]["output_tokens"] for i in tab.ids if (i, t) in rows])
        lat = np.array([rows[(i, t)]["latency_ms"] / 1000 for i in tab.ids if (i, t) in rows])
        c = tab.cost[:, j] * 1e3
        kw = dict(histtype="step", lw=1.0, color=TC[t], label=t)
        axs[0].hist(out_tok, bins=np.logspace(1, 4.2, 36), **kw)
        axs[1].hist(c, bins=np.logspace(-3.5, 1.3, 36), **kw)
        axs[2].hist(lat, bins=np.logspace(-0.3, 2.5, 36), **kw)
        for ax, v in zip(axs, (out_tok, c, lat)):
            ax.axvline(np.median(v), color=TC[t], lw=0.6, ls="--")
    for ax, lab in zip(axs, ("output tokens per call", "list-price cost per call (×10$^{-3}$ USD)", "wall-clock latency per call (s)")):
        ax.set_xscale("log"); ax.set_xlabel(lab); ax.grid(axis="y", visible=False)
    axs[0].set_ylabel("calls"); axs[0].legend(loc="upper left")
    fig.tight_layout(w_pad=1.2)
    fig.savefig(FIG / "cost_dist.pdf"); plt.close(fig)


def fig_oracle_mix(tab, FIG):
    srcs = [s for s in SRC_ORDER if s in set(tab.source)]
    orc = tab.oracle()
    none = ~tab.correct.any(1)
    fig, ax = plt.subplots(figsize=(3.35, 2.1))
    left = np.zeros(len(srcs))
    for lab, col, sel in [("small", TC["small"], lambda m: (orc == 0) & ~none), ("medium", TC["medium"], lambda m: orc == 1),
                          ("large", TC["large"], lambda m: (orc == 2) & ~none), ("none correct", "#d1d5db", lambda m: none)]:
        v = np.array([(sel(None) & (tab.source == s)).sum() / (tab.source == s).sum() for s in srcs])
        ax.barh(np.arange(len(srcs)), v, left=left, color=col, height=0.62, label=lab, lw=0)
        left += v
    ax.set_yticks(np.arange(len(srcs)), [SRC[s] for s in srcs]); ax.invert_yaxis()
    ax.set_xlim(0, 1); ax.set_xlabel("share of prompts by oracle label (cheapest correct tier)")
    ax.grid(axis="y", visible=False)
    ax.legend(ncol=4, loc="lower left", bbox_to_anchor=(-0.02, 1.0), columnspacing=0.8, handlelength=1.0)
    fig.savefig(FIG / "oracle_mix.pdf"); plt.close(fig)


def fig_sft(sft, FIG):
    h = sft["history"]
    ep = [e["epoch"] for e in h]
    fig, ax = plt.subplots(figsize=(3.35, 1.9))
    ax.plot(ep, [e["val_loss"] for e in h], "-o", ms=2.5, lw=1, color=INK, label="val loss")
    tr = [(e["epoch"], e["train_loss"]) for e in h if e["train_loss"] is not None]
    ax.plot(*zip(*tr), "--", lw=1, color=GREY, label="train loss")
    ax.set_xlabel("epoch (0 = zero-shot)"); ax.set_ylabel("cross-entropy")
    bx = ax.twinx()
    bx.plot(ep, [e["val_acc_vs_oracle"] for e in h], "-s", ms=2.5, lw=1, color=GOLD, label="val agreement with oracle")
    bx.set_ylabel("agreement", color=GOLD); bx.grid(False); bx.tick_params(axis="y", colors=GOLD)
    ax.axvline(sft["best"]["epoch"], color=GOLD, lw=0.6, ls=":")
    l1, n1 = ax.get_legend_handles_labels(); l2, n2 = bx.get_legend_handles_labels()
    ax.legend(l1 + l2, n1 + n2, loc="center right")
    fig.savefig(FIG / "sft_curves.pdf"); plt.close(fig)


def fig_rl_curves(rls, FIG):
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.0))
    cm = plt.get_cmap("viridis")
    for k, r in enumerate(rls):
        col = cm(k / max(1, len(rls) - 1) * 0.9)
        h = r["train_curve"]
        for ax, key in zip(axs, ("reward", "entropy")):
            v = np.array([e[key] for e in h])
            kk = 25
            ma = np.convolve(v, np.ones(kk) / kk, mode="valid")
            ax.plot(np.arange(len(ma)) + kk, ma, lw=1, color=col, label=f"λ = {r['lambda']:g}")
    axs[0].set_ylabel("train reward (25-step MA)"); axs[1].set_ylabel("policy entropy (nats, 25-step MA)")
    axs[1].axhline(np.log(3), color=GREY, lw=0.6, ls="--"); axs[1].text(5, np.log(3) * 0.985, "uniform = ln 3", fontsize=6, va="top", color=GREY)
    for ax in axs:
        ax.set_xlabel("RL step")
    axs[0].legend(ncol=2, loc="lower right")
    fig.tight_layout(w_pad=1.5)
    fig.savefig(FIG / "rl_curves.pdf"); plt.close(fig)


def fig_lambda_sweep(rls, FIG):
    lams = [r["lambda"] for r in rls]
    share = np.array([r["test"]["action_share"] for r in rls])
    fig, ax = plt.subplots(figsize=(3.35, 2.1))
    x = np.arange(len(lams))
    bottom = np.zeros(len(lams))
    for j, t in enumerate(TIER_NAMES):
        ax.bar(x, share[:, j], 0.55, bottom=bottom, color=TC[t], label=t, lw=0, alpha=0.9)
        bottom += share[:, j]
    ax.set_xticks(x, [f"{l:g}" for l in lams]); ax.set_xlabel("cost weight λ"); ax.set_ylabel("test action share")
    ax.set_ylim(0, 1); ax.grid(axis="x", visible=False)
    bx = ax.twinx()
    bx.plot(x, [r["test"]["accuracy"] for r in rls], "-o", ms=3, color=INK, lw=1, label="accuracy")
    bx.plot(x, [r["test"]["cost_vs_large"] for r in rls], "-D", ms=2.5, color=GOLD, lw=1, label="cost / always-large")
    bx.set_ylim(0, 1.0); bx.grid(False); bx.set_ylabel("accuracy · relative cost")
    l1, n1 = ax.get_legend_handles_labels(); l2, n2 = bx.get_legend_handles_labels()
    ax.legend(l1 + l2, n1 + n2, ncol=3, loc="lower left", bbox_to_anchor=(-0.02, 1.0), columnspacing=0.7, handlelength=1.0)
    fig.savefig(FIG / "lambda_sweep.pdf"); plt.close(fig)


def fig_confusion(tab, allr, FIG):
    te = tab.idx("test")
    pos = {i: k for k, i in enumerate(tab.ids[te])}
    auto = next(p for p in allr["policies"] if p["kind"] == "rl" and p["lambda"] == allr["modes"]["auto"])
    acts = np.array(auto["actions"])
    orc = tab.oracle()[te][[pos[i] for i in allr["test_ids"]]]
    M = np.zeros((3, 3), int)
    for o, a in zip(orc, acts):
        M[o, a] += 1
    fig, ax = plt.subplots(figsize=(2.3, 2.1))
    ax.imshow(M, cmap="Greys", vmin=0, vmax=M.max() * 1.25)
    for i in range(3):
        for j in range(3):
            ax.text(j, i, M[i, j], ha="center", va="center", fontsize=8, color="white" if M[i, j] > M.max() * 0.6 else INK)
    ax.set_xticks(range(3), TIER_NAMES); ax.set_yticks(range(3), TIER_NAMES)
    for lbl, t in zip(ax.get_xticklabels(), TIER_NAMES):
        lbl.set_color(TC[t])
    for lbl, t in zip(ax.get_yticklabels(), TIER_NAMES):
        lbl.set_color(TC[t])
    ax.set_xlabel(rf"router action (auto, $\lambda$ = {allr['modes']['auto']:g})"); ax.set_ylabel("oracle label")
    ax.grid(False); ax.tick_params(top=False, right=False)
    fig.savefig(FIG / "confusion.pdf"); plt.close(fig)
    return M, float(np.trace(M) / M.sum())


def fig_calibration(tab, rls, allr, FIG):
    """Reliability of the auto policy's confidence in its chosen tier vs. whether that tier was correct."""
    lam = allr["modes"]["auto"]
    r = next(x for x in rls if x["lambda"] == lam)
    pos = {i: k for k, i in enumerate(tab.ids)}
    rows = np.array([pos[i] for i in r["test_ids"]])
    P = np.array(r["test_probs"]); a = np.array(r["test_actions"])
    conf = P[np.arange(len(a)), a]
    ok = tab.correct[rows, a].astype(float)
    bins = np.linspace(conf.min() - 1e-9, conf.max() + 1e-9, 7)
    idx = np.digitize(conf, bins) - 1
    fig, (ax, hx) = plt.subplots(2, 1, figsize=(2.3, 2.6), gridspec_kw={"height_ratios": [3, 1], "hspace": 0.08}, sharex=True)
    xs, ys, ns = [], [], []
    for b in range(len(bins) - 1):
        m = idx == b
        if m.sum() >= 3:
            xs.append(conf[m].mean()); ys.append(ok[m].mean()); ns.append(int(m.sum()))
            lo, hi = wilson(int(ok[m].sum()), int(m.sum()))
            ax.plot([conf[m].mean()] * 2, [lo, hi], color=INK, lw=0.6)
    ax.plot(xs, ys, "-o", ms=3, lw=1, color=GOLD)
    ax.set_ylim(0, 1.05); ax.set_ylabel("P(chosen tier correct)")
    hx.hist(conf, bins=bins, color=GREY, lw=0); hx.set_xlabel(r"router confidence $\pi(a \mid s)$ of chosen tier"); hx.set_ylabel("n"); hx.grid(False)
    fig.savefig(FIG / "calibration.pdf"); plt.close(fig)
    return float(np.corrcoef(conf, ok)[0, 1]) if ok.std() > 0 and conf.std() > 0 else float("nan")


def fig_source_heatmap(allr, FIG):
    P = allr["policies"]
    def get(n, lam=None):
        return next((p for p in P if p["name"] == n and p.get("lambda") == lam), None)
    pols = [("always-small", get("always-small")), ("always-medium", get("always-medium")), ("always-large", get("always-large")),
            ("oracle", get("oracle")), ("zero-shot Laya", get("zero-shot Laya")), ("SFT Laya", get("SFT Laya"))]
    for mode in ("auto-quality", "auto", "auto-cheap"):
        lam = allr["modes"][mode]
        pols.append((f"RL {mode} (λ={lam:g})", get("RL Laya", lam)))
    pols = [(n, p) for n, p in pols if p is not None]
    seen, uniq = set(), []
    for n, p in pols:
        if id(p) not in seen:
            uniq.append((n, p)); seen.add(id(p))
    srcs = [s for s in SRC_ORDER if s in uniq[0][1]["by_source"]]
    A = np.array([[p["by_source"][s]["accuracy"] for s in srcs] for _, p in uniq])
    C = np.array([[p["by_source"][s]["cost_vs_large"] for s in srcs] for _, p in uniq])
    fig, ax = plt.subplots(figsize=(7.0, 0.36 * len(uniq) + 0.9))
    ax.imshow(A, cmap="Greys", vmin=0.2, vmax=1.15, aspect="auto")
    for i in range(A.shape[0]):
        for j in range(A.shape[1]):
            dark = A[i, j] > 0.72
            ax.text(j, i - 0.12, f"{100 * A[i, j]:.0f}", ha="center", va="center", fontsize=7.5, color="white" if dark else INK)
            ax.text(j, i + 0.24, f"{100 * C[i, j]:.0f}% cost", ha="center", va="center", fontsize=5.2, color="#e5e7eb" if dark else "#4b5563")
    ax.set_xticks(range(len(srcs)), [SRC[s] + f"\n(n={uniq[0][1]['by_source'][s]['n']})" for s in srcs])
    ax.set_yticks(range(len(uniq)), [n for n, _ in uniq])
    ax.tick_params(top=False, right=False, length=0); ax.grid(False)
    ax.set_title("test accuracy (%) · cost relative to always-large", loc="left", fontsize=7.5)
    fig.savefig(FIG / "source_heatmap.pdf"); plt.close(fig)


# ---------------------------------------------------------------- tables + numbers
def dataset_table(tab, rows, GEN):
    srcs = [s for s in SRC_ORDER if s in set(tab.source)]
    orc = tab.oracle(); none = ~tab.correct.any(1)
    cells = []
    for s in srcs + ["ALL"]:
        m = np.ones(len(tab.ids), bool) if s == "ALL" else tab.source == s
        n = int(m.sum())
        spl = [int(((tab.split == x) & m).sum()) for x in ("train", "val", "test")]
        acc = [p1(tab.correct[m, j].mean()) for j in range(3)]
        mix = [p1(((orc == 0) & ~none & m).sum() / n), p1(((orc == 1) & m).sum() / n), p1(((orc == 2) & ~none & m).sum() / n), p1((none & m).sum() / n)]
        tok = [int(np.median([rows[(i, t)]["output_tokens"] for i in tab.ids[m] if (i, t) in rows])) for t in TIER_NAMES]
        name = "*All*" if s == "ALL" else SRC[s]
        cells.append(f"[{name}], [{n}], [{spl[0]}/{spl[1]}/{spl[2]}], " + ", ".join(f"[{a}]" for a in acc) + ", "
                     + ", ".join(f"[{x}]" for x in mix) + ", " + ", ".join(f"[{x}]" for x in tok))
    body = ",\n  ".join(cells[:-1]) + ",\n  table.hline(stroke: 0.4pt),\n  " + cells[-1]
    (GEN / "dataset_table.typ").write_text(
        "// GENERATED — do not edit\n#table(columns: 13, align: (left,) + (right,) * 12, stroke: none, inset: (x: 3.2pt, y: 2.6pt),\n"
        "  table.hline(),\n  table.header([], [], [], table.cell(colspan: 3, align: center)[*accuracy %*], table.cell(colspan: 4, align: center)[*oracle label %*], table.cell(colspan: 3, align: center)[*median out-tokens*],\n"
        "  [*Source*], [*n*], [*tr/va/te*], [S], [M], [L], [S], [M], [L], [none], [S], [M], [L]),\n"
        "  table.hline(stroke: 0.4pt),\n  " + body + ",\n  table.hline())\n", encoding="utf-8")


def hparam_table(GEN):
    tr = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
    s, r = tr["sft"], tr["rl"]
    rows = [("Encoder", "ModernBERT-large, 28 layers, 421M params (Laya)"), ("Trainable", f"top {s['train_encoder_layers']} layers + decision head"),
            ("SFT", f"lr {s['lr']:g}, batch {s['batch_size']}×{s['grad_accum']}, ≤{s['epochs']} epochs, patience {s['patience']}"),
            ("RL", f"REINFORCE, {r['steps']} steps, batch {r['batch_size']}, lr {r['lr']:g}"),
            ("Baseline b", f"running mean, momentum {r['baseline_momentum']}"), ("Entropy β", f"{r['entropy_beta_start']:g} → {r['entropy_beta_end']:g} (linear)"),
            ("λ grid", ", ".join(f"{x:g}" for x in r["lambdas"])), ("Selection", f"best val reward (checked every {r['snapshot_every']} steps)"),
            ("Bootstrap", f"{tr['eval']['bootstrap']} resamples, seed {tr['seed']}"), ("Hardware", "1× RTX 3050 Laptop (4 GB), bf16")]
    body = ",\n  ".join(f"[{k}], [{v}]" for k, v in rows)
    (GEN / "hparam_table.typ").write_text("// GENERATED — do not edit\n#table(columns: 2, align: (left, left), stroke: none, inset: (x: 3pt, y: 2.4pt),\n"
                                           "  table.hline(),\n  " + body + ",\n  table.hline())\n", encoding="utf-8")


def paired_table(allr, rls, GEN):
    P = [p for p in allr["policies"] if p["kind"] == "rl"]
    P.sort(key=lambda p: p["lambda"])
    rlby = {r["lambda"]: r for r in rls}
    cells = []
    for p in P:
        d = p["vs_always_large_acc"]
        r = rlby.get(p["lambda"])
        cells.append(f"[{p['lambda']:g}], [{p1(p['accuracy'])}], [{100 * d['diff']:+.1f} [{100 * d['ci'][0]:+.1f}, {100 * d['ci'][1]:+.1f}]], "
                     f"[{p1(p['cost_vs_large'])} [{p1(p['cost_vs_large_ci'][0])}, {p1(p['cost_vs_large_ci'][1])}]], "
                     f"[{'/'.join(f'{100 * x:.0f}' for x in p['action_share'])}], [{p['mean_reward']:.3f}], [{r['best_step'] if r else '—'}]")
    (GEN / "paired_table.typ").write_text(
        "// GENERATED — do not edit\n#table(columns: 7, align: (center, right, right, right, center, right, right), stroke: none, inset: (x: 3.2pt, y: 2.6pt),\n"
        "  table.hline(),\n  [*λ*], [*Acc %*], [*Δ vs large (pts) [95% CI]*], [*Cost % [95% CI]*], [*S/M/L %*], [*Reward*], [*Best step*],\n"
        "  table.hline(stroke: 0.4pt),\n  " + ",\n  ".join(cells) + ",\n  table.hline())\n", encoding="utf-8")


def main(GEN, FIG, allr, sft):
    style()
    tab = load_table()
    rows = _outcome_rows(tab)
    rls = _rl()
    fig_dataset(tab, FIG)
    pats = fig_patterns(tab, FIG)
    fig_cost(tab, rows, FIG)
    fig_oracle_mix(tab, FIG)
    fig_sft(sft, FIG)
    if rls:
        fig_rl_curves(rls, FIG)
        fig_lambda_sweep(rls, FIG)
    M, agree = fig_confusion(tab, allr, FIG)
    rho = fig_calibration(tab, rls, allr, FIG)
    fig_source_heatmap(allr, FIG)
    dataset_table(tab, rows, GEN)
    hparam_table(GEN)
    paired_table(allr, rls, GEN)

    # auto vs always-medium (paired bootstrap on the test split) and the test-best RL policy, for honest framing
    te_pos = {i: k for k, i in enumerate(tab.ids)}
    rows_te = np.array([te_pos[i] for i in allr["test_ids"]])
    auto_p = next(p for p in allr["policies"] if p["kind"] == "rl" and p["lambda"] == allr["modes"]["auto"])
    ok_auto = tab.correct[rows_te, np.array(auto_p["actions"])].astype(float)
    ok_med = tab.correct[rows_te, 1].astype(float)
    rng = np.random.default_rng(allr["seed"])
    bs = [(ok_auto[ix] - ok_med[ix]).mean() for ix in (rng.integers(0, len(rows_te), len(rows_te)) for _ in range(allr["bootstrap"]))]
    vs_med = (float(ok_auto.mean() - ok_med.mean()), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5)))
    best = max((p for p in allr["policies"] if p["kind"] == "rl"), key=lambda p: (p["accuracy"], -p["mean_cost_usd"]))
    large_p = next(p for p in allr["policies"] if p["name"] == "always-large")
    gaps = {k: auto_p["by_source"][k]["accuracy"] - large_p["by_source"][k]["accuracy"] for k in auto_p["by_source"]}
    worst = min(gaps, key=gaps.get)
    med_share = float(np.mean([p["action_share"][1] for p in allr["policies"] if p["kind"] == "rl" and p["lambda"] > 0]))

    acc = tab.correct.mean(0)
    tot_calls = sum(1 for _ in rows)
    tot_cost = float(tab.cost.sum())
    tok_in = sum(r["input_tokens"] for r in rows.values()); tok_out = sum(r["output_tokens"] for r in rows.values())
    lat = {t: float(np.median([rows[(i, t)]["latency_ms"] for i in tab.ids if (i, t) in rows])) / 1000 for t in TIER_NAMES}
    mcost = tab.cost.mean(0)
    only_large = int((~tab.correct[:, 0] & ~tab.correct[:, 1] & tab.correct[:, 2]).sum())
    small_not_large = int((tab.correct[:, 0] & ~tab.correct[:, 2]).sum())
    L = ["// GENERATED by paper/gen_extra.py — do not edit",
         f'#let acc_small = "{p1(acc[0])}"', f'#let acc_medium = "{p1(acc[1])}"', f'#let acc_large = "{p1(acc[2])}"',
         f'#let acc_oracle_all = "{p1(tab.correct.any(1).mean())}"', f'#let none_correct = "{p1((~tab.correct.any(1)).mean())}"',
         f'#let all_correct = "{p1(tab.correct.all(1).mean())}"', f"#let n_only_large = {only_large}", f"#let n_small_not_large = {small_not_large}",
         f"#let n_calls = {tot_calls}", f'#let dataset_cost = "{tot_cost:.2f}"', f'#let tok_in_m = "{tok_in / 1e6:.2f}"', f'#let tok_out_m = "{tok_out / 1e6:.2f}"',
         f'#let cost_ratio_large_small = "{mcost[2] / mcost[0]:.0f}"', f'#let cost_ratio_large_medium = "{mcost[2] / mcost[1]:.0f}"',
         f'#let lat_small = "{lat["small"]:.1f}"', f'#let lat_medium = "{lat["medium"]:.1f}"', f'#let lat_large = "{lat["large"]:.1f}"',
         f'#let auto_oracle_agree = "{p1(agree)}"', f'#let n_patterns = {len(pats)}',
         f'#let calib_r = "{rho:.2f}"', f"#let n_rl_done = {len(rls)}",
         f'#let rl_lams_done = "{", ".join(f"{r["lambda"]:g}" for r in rls)}"',
         f'#let auto_vs_med = "{100 * vs_med[0]:+.1f}"', f'#let auto_vs_med_lo = "{100 * vs_med[1]:+.1f}"', f'#let auto_vs_med_hi = "{100 * vs_med[2]:+.1f}"',
         f'#let best_lam = "{best["lambda"]:g}"', f'#let best_acc = "{p1(best["accuracy"])}"', f'#let best_cost = "{p1(best["cost_vs_large"])}"',
         f'#let worst_src = "{SRC.get(worst, worst)}"', f'#let worst_gap = "{100 * gaps[worst]:+.1f}"', f"#let worst_n = {auto_p['by_source'][worst]['n']}",
         f'#let rl_med_share = "{p1(med_share)}"', f'#let auto_pareto = {str(bool(auto_p["on_pareto_front"])).lower()}']
    (GEN / "extra.typ").write_text("\n".join(L) + "\n", encoding="utf-8")
