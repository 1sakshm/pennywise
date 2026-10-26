"""Phase 5: REINFORCE contextual bandit on top of the SFT warm-start, one policy per lambda.

State s = prompt; action a in {small, medium, large} sampled from Laya's option distribution
pi(a|s); reward r = correct(a) - lambda * cost(a)/cost_ref looked up in the outcome table
(no new API calls). Only the sampled arm's reward is used, which simulates the online
partial-feedback setting even though the offline table has all three outcomes.

loss = -(r - b) * log pi(a|s) - beta * H(pi(.|s)),   b = running mean (or batch mean),
beta annealed linearly from beta_start to beta_end.

Every `snapshot_every` steps: greedy policy on all prompts -> per-prompt [action, prob] and
val/test reward/accuracy/cost (drives the galaxy + training visuals). The checkpoint with the
best *val* reward is kept; test is never used for selection.

Outputs per lambda: CKPTS/rl_lam{lam}/, SNAPSHOTS/rl_lam{lam}.json, RESULTS/rl_lam{lam}.json.
Resumable at lambda granularity (finished lambdas are skipped).
Usage: python -m router.rl [--lambdas 0.25,0.5] [--steps N]
"""
import argparse
import json
import time

import numpy as np
import torch
import yaml

from router.data import load_table, metrics
from router.laya_model import LayaPolicy
from router.paths import CKPTS, RESULTS, ROOT, SNAPSHOTS, SYNTHETIC
from router.sft import seed_all

CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
R, SEED = CFG["rl"], CFG["seed"]
N_TOP = CFG["sft"]["train_encoder_layers"]


def lam_tag(lam):
    return f"{lam:g}"


@torch.no_grad()
def snapshot(pol, cache, tab, lam):
    pol.model.eval()
    P = pol.probs_cached(cache, N_TOP)
    a = P.argmax(1)
    out = {}
    for split in ("train", "val", "test"):
        rows = tab.idx(split)
        out[split] = {**metrics(tab, a[rows], rows), "reward": float(tab.reward(a[rows], lam, rows).mean())}
        out[split].pop("action_share")
    pol.model.train()
    return P, a, out


def train_one(lam, tab, steps, cache):
    seed_all(SEED)
    pol = LayaPolicy(str(CKPTS / "sft"))
    params = pol.prepare_for_training(N_TOP)
    opt = torch.optim.AdamW(params, lr=R["lr"], weight_decay=0.0)
    tr = tab.idx("train")
    rng = np.random.default_rng(SEED)
    gen = torch.Generator(device=pol.device).manual_seed(SEED)
    b, hist, snaps = None, [], []
    best_val, tag = -np.inf, lam_tag(lam)
    t0 = time.time()

    def take_snapshot(step):
        nonlocal best_val
        P, a, m = snapshot(pol, cache, tab, lam)
        snaps.append({"step": step, "train_reward_ma": float(np.mean([h["reward"] for h in hist[-R["snapshot_every"]:]])) if hist else None,
                      **m, "probs": P.round(3).tolist()})
        if m["val"]["reward"] > best_val:
            best_val = m["val"]["reward"]
            pol.save(str(CKPTS / f"rl_lam{tag}"))
            snaps[-1]["is_best_val"] = True
        print(f"  [lam={tag}] step {step:5d}  train_r_ma {snaps[-1]['train_reward_ma'] if hist else float('nan'):.4f}  "
              f"val r {m['val']['reward']:.4f} acc {m['val']['accuracy']:.3f} cost {m['val']['cost_vs_large']:.3f}  "
              f"({time.time() - t0:.0f}s)", flush=True)

    pol.model.train()
    take_snapshot(0)
    for step in range(1, steps + 1):
        beta = R["entropy_beta_start"] + (R["entropy_beta_end"] - R["entropy_beta_start"]) * (step - 1) / max(1, steps - 1)
        rows = rng.choice(tr, R["batch_size"], replace=False)
        logits = pol.logits_cached([cache[i] for i in rows], N_TOP)
        logp = torch.log_softmax(logits, -1)
        a = torch.multinomial(logp.exp(), 1, generator=gen).squeeze(-1)
        r = torch.tensor(tab.reward(a.cpu().numpy(), lam, rows), device=logits.device, dtype=torch.float32)
        if R["baseline"] == "batch_mean":
            base = r.mean()
        else:
            base = r.mean() if b is None else torch.tensor(b, device=r.device)
            b = float(r.mean()) if b is None else R["baseline_momentum"] * b + (1 - R["baseline_momentum"]) * float(r.mean())
        adv = r - base
        ent = -(logp.exp() * logp).sum(-1)
        loss = -(adv * logp.gather(1, a[:, None]).squeeze(1)).mean() - beta * ent.mean()
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        hist.append({"step": step, "reward": float(r.mean()), "entropy": float(ent.mean()), "beta": beta,
                     "baseline": float(base), "loss": float(loss)})
        if step % R["snapshot_every"] == 0 or step == steps:
            take_snapshot(step)

    # final test evaluation uses the best-val checkpoint
    best = max(snaps, key=lambda s: s["val"]["reward"])
    a_best = np.array(best["probs"]).argmax(1)
    te = tab.idx("test")
    summary = {"lambda": lam, "seed": SEED, "synthetic": SYNTHETIC, "steps": steps, "best_step": best["step"],
               "config": R, "cost_ref_usd": tab.cost_ref, "test_ids": tab.ids[te].tolist(),
               "test": {**metrics(tab, a_best[te], te), "reward": float(tab.reward(a_best[te], lam, te).mean())},
               "test_actions": a_best[te].tolist(), "test_probs": np.array(best["probs"])[te].tolist(),
               "train_curve": hist}
    json.dump({"lambda": lam, "ids": tab.ids.tolist(), "split": tab.split.tolist(), "snapshots": snaps},
              open(SNAPSHOTS / f"rl_lam{tag}.json", "w"))
    json.dump(summary, open(RESULTS / f"rl_lam{tag}.json", "w"), indent=1)
    t = summary["test"]
    print(f"[lam={tag}] done in {time.time() - t0:.0f}s; best val step {best['step']}; test acc {t['accuracy']:.3f} "
          f"cost_vs_large {t['cost_vs_large']:.3f} share {t['action_share']}")
    del pol, opt
    torch.cuda.empty_cache()


def main(a):
    tab = load_table()
    lams = [float(x) for x in a.lambdas.split(",")] if a.lambdas else R["lambdas"]
    cache = None
    for lam in lams:
        if (RESULTS / f"rl_lam{lam_tag(lam)}.json").exists() and not a.force:
            print(f"[lam={lam_tag(lam)}] already done, skipping")
            continue
        if cache is None:  # lower layers are frozen in SFT and RL, so the base model's cache is exact for all
            cache = LayaPolicy().lower_cache(tab.prompts, N_TOP)
            torch.cuda.empty_cache()
        train_one(lam, tab, a.steps or R["steps"], cache)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lambdas", default="")
    ap.add_argument("--steps", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    main(ap.parse_args())
