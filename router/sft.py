"""Phase 4: supervised warm-start. Label = oracle tier (cheapest correct; large if none).

Cross-entropy over the 3 router options read at Laya's option markers. Top encoder layers +
decision head are trained (4 GB VRAM); early stopping on val loss.
Writes CKPTS/sft (Laya checkpoint layout) and RESULTS/sft_history.json.
Usage: python -m router.sft
"""
import json
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
import yaml

from router.data import load_table
from router.laya_model import LayaPolicy
from router.paths import CKPTS, RESULTS, ROOT, SYNTHETIC

CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
S = CFG["sft"]
SEED = CFG["seed"]


def seed_all(s):
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)
    torch.cuda.manual_seed_all(s)


@torch.no_grad()
def evaluate(pol, cache, rows, y, n_top):
    pol.model.eval()
    losses, preds = [], []
    for i in range(0, len(rows), 32):
        r = rows[i:i + 32]
        lg = pol.logits_cached([cache[j] for j in r], n_top)
        losses.append(F.cross_entropy(lg, torch.tensor(y[r], device=lg.device), reduction="sum").item())
        preds.append(lg.argmax(-1).cpu().numpy())
    preds = np.concatenate(preds)
    return sum(losses) / len(rows), float((preds == y[rows]).mean()), preds


def main():
    seed_all(SEED)
    tab = load_table()
    y = tab.oracle()
    tr, va = tab.idx("train"), tab.idx("val")
    pol = LayaPolicy()
    n_top = S["train_encoder_layers"]
    cache = pol.lower_cache(tab.prompts, n_top)  # frozen lower layers run once (see LayaPolicy.lower_cache)
    params = pol.prepare_for_training(n_top, offload_frozen=True)
    print(f"trainable params: {sum(p.numel() for p in params) / 1e6:.1f}M | train {len(tr)} val {len(va)}"
          f" | oracle label share {np.bincount(y[tr], minlength=3) / len(tr)}")
    opt = torch.optim.AdamW(params, lr=S["lr"], weight_decay=0.01)
    steps_total = S["epochs"] * int(np.ceil(len(tr) / (S["batch_size"] * S["grad_accum"])))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 20) * max(0.0, 1 - s / steps_total))

    zs_loss, zs_acc, _ = evaluate(pol, cache, va, y, n_top)
    hist = [{"epoch": 0, "val_loss": zs_loss, "val_acc_vs_oracle": zs_acc, "train_loss": None}]
    print(f"epoch 0 (zero-shot)  val_loss {zs_loss:.4f}  val_acc_vs_oracle {zs_acc:.3f}")
    best, bad, out = float("inf"), 0, CKPTS / "sft"
    rng = np.random.default_rng(SEED)
    for ep in range(1, S["epochs"] + 1):
        pol.model.train()
        order = rng.permutation(tr)
        t0, run = time.time(), []
        opt.zero_grad()
        for k, i in enumerate(range(0, len(order), S["batch_size"])):
            r = order[i:i + S["batch_size"]]
            lg = pol.logits_cached([cache[j] for j in r], n_top)
            loss = F.cross_entropy(lg, torch.tensor(y[r], device=lg.device))
            (loss / S["grad_accum"]).backward()
            run.append(loss.item())
            if (k + 1) % S["grad_accum"] == 0 or i + S["batch_size"] >= len(order):
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                opt.step()
                sched.step()
                opt.zero_grad()
        vl, vacc, _ = evaluate(pol, cache, va, y, n_top)
        hist.append({"epoch": ep, "val_loss": vl, "val_acc_vs_oracle": vacc, "train_loss": float(np.mean(run))})
        mem = torch.cuda.max_memory_allocated() / 2**30 if torch.cuda.is_available() else 0
        print(f"epoch {ep}  train {np.mean(run):.4f}  val_loss {vl:.4f}  val_acc_vs_oracle {vacc:.3f}"
              f"  ({time.time() - t0:.0f}s, peak {mem:.2f} GB)", flush=True)
        if vl < best - 1e-4:
            best, bad = vl, 0
            pol.save(str(out))
        else:
            bad += 1
            if bad >= S["patience"]:
                print("early stop")
                break
    best_ep = min(hist[1:], key=lambda h: h["val_loss"])
    json.dump({"seed": SEED, "synthetic": SYNTHETIC, "config": S, "zero_shot": hist[0], "best": best_ep,
               "history": hist}, open(RESULTS / "sft_history.json", "w"), indent=1)
    # test-split actions of the selected (best-val) checkpoint, for evaluate.py
    del pol, opt
    torch.cuda.empty_cache()
    best_pol = LayaPolicy(str(out))
    te = tab.idx("test")
    # cached path: frozen lower layers come from the base model (the saved checkpoint holds them
    # bf16-rounded), matching training and serving (router/serve_policy.py uses base + deltas)
    P = best_pol.probs_cached([cache[i] for i in te], n_top)
    json.dump({"name": "SFT Laya", "seed": SEED, "synthetic": SYNTHETIC, "test_ids": tab.ids[te].tolist(),
               "test_actions": P.argmax(1).tolist(), "test_probs": P.round(4).tolist()},
              open(RESULTS / "sft.json", "w"), indent=1)
    verdict = "BEATS" if best_ep["val_acc_vs_oracle"] > zs_acc else "DOES NOT beat"
    print(f"best epoch {best_ep['epoch']}: val_acc_vs_oracle {best_ep['val_acc_vs_oracle']:.3f} "
          f"{verdict} zero-shot {zs_acc:.3f}; checkpoint -> {out}")


if __name__ == "__main__":
    main()
