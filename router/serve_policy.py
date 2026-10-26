"""Serving-time multi-lambda router with shared frozen weights.

SFT and RL only train the top-N encoder layers + decision head (`LayaPolicy.prepare_for_training`),
so every trained policy shares the base model's embeddings and lower layers bit-for-bit. We load
the base Laya once and give each lambda its own copy of only the trainable modules:
~1.7 GB + ~0.3 GB per extra lambda in fp32 instead of ~1.7 GB per policy.

Deltas (only trainable modules, fp16 safetensors) are produced by `export_deltas()` and live in
SERVE_DIR (default router/serve/). Without any deltas the router falls back to zero-shot Laya.
"""
import copy
import os
import threading
import time
from pathlib import Path

import numpy as np
import torch
import yaml

from router.laya_model import ACTIONS, BASE_MODEL, LayaPolicy
from router.paths import CKPTS, ROOT

N_TOP = yaml.safe_load(open(ROOT / "config" / "train.yaml"))["sft"]["train_encoder_layers"]
SERVE_DIR = Path(os.environ.get("SERVE_DIR", ROOT / "router" / "serve"))


def trainable_prefixes(n_layers_total: int):
    return tuple([f"encoder.layers.{i}." for i in range(n_layers_total - N_TOP, n_layers_total)]
                 + ["encoder.final_norm.", "head.", "type_emb.", "scorer."])


def export_deltas(lambdas=None, out_dir=SERVE_DIR):
    """Write rl_lam{lam}.safetensors holding only the trainable modules of each RL checkpoint,
    plus modes.json (proxy mode -> lambda, chosen on val by eval/evaluate.py).
    Default: only the lambdas the modes use (keeps serving RAM ~2.3 GB)."""
    import json
    from safetensors.torch import load_file, save_file
    from router.paths import RESULTS
    modes = json.load(open(RESULTS / "all.json"))["modes"]
    lambdas = sorted(set(modes.values())) if lambdas is None else lambdas
    out_dir.mkdir(parents=True, exist_ok=True)
    json.dump({"modes": modes}, open(out_dir / "modes.json", "w"), indent=1)
    for lam in lambdas:
        sd = load_file(str(CKPTS / f"rl_lam{lam:g}" / "model.safetensors"))
        n = 1 + max(int(k.split(".")[2]) for k in sd if k.startswith("encoder.layers."))
        pre = trainable_prefixes(n)
        delta = {k: v.half().contiguous() for k, v in sd.items() if k.startswith(pre)}
        save_file(delta, str(out_dir / f"rl_lam{lam:g}.safetensors"))
        print(f"lam={lam:g}: {len(delta)} tensors, {sum(v.numel() for v in delta.values()) / 1e6:.1f}M params")


def _shallow(mod):
    """Copy of a module object with its own (shallow-copied) registries, so assigning a child
    never touches the original's."""
    c = copy.copy(mod)
    c._modules, c._parameters, c._buffers = dict(mod._modules), dict(mod._parameters), dict(mod._buffers)
    return c


def _clone_trainable(base):
    """DecisionModel sharing every frozen submodule with `base`, owning fresh copies of the trainable ones."""
    m, enc = _shallow(base), _shallow(base.encoder)
    n = len(base.encoder.layers)
    layers = torch.nn.ModuleList([copy.deepcopy(l) if i >= n - N_TOP else l for i, l in enumerate(base.encoder.layers)])
    enc._modules["layers"] = layers
    enc._modules["final_norm"] = copy.deepcopy(base.encoder.final_norm)
    m._modules["encoder"] = enc
    for name in ("head", "type_emb", "scorer"):
        m._modules[name] = copy.deepcopy(base._modules[name])
    return m


class MultiPolicy:
    def __init__(self, device="cpu"):
        from safetensors.torch import load_file
        torch.set_grad_enabled(False)
        self.base = LayaPolicy(BASE_MODEL, device=device)
        self.device = self.base.device
        self.policies, self.lambdas = {}, []
        files = sorted(SERVE_DIR.glob("rl_lam*.safetensors")) if SERVE_DIR.exists() else []
        only = {float(x) for x in os.environ.get("SERVE_LAMBDAS", "").split(",") if x.strip()}
        for f in files:
            lam = float(f.stem.replace("rl_lam", ""))
            if only and lam not in only:
                continue
            m = _clone_trainable(self.base.model)
            res = m.load_state_dict({k: v.float() for k, v in load_file(str(f)).items()}, strict=False)
            assert not res.unexpected_keys, res.unexpected_keys
            m.eval()
            self.policies[lam] = m
            self.lambdas.append(lam)
        self.lambdas.sort()
        self.lock = threading.Lock()
        self.mode = "rl" if self.lambdas else "zero-shot"

    def nearest(self, lam):
        if not self.lambdas:
            return None
        return min(self.lambdas, key=lambda x: abs(x - lam))

    def route(self, prompt: str, lam: float):
        """-> (action, probs dict, latency_ms, lambda_used)"""
        used = self.nearest(lam)
        t0 = time.perf_counter()
        with self.lock, torch.no_grad():  # grad mode is thread-local; route() runs in worker threads
            orig = self.base.model
            if used is not None:
                self.base.model = self.policies[used]
            try:
                p = torch.softmax(self.base.logits([prompt]), -1)[0].cpu().numpy()
            finally:
                self.base.model = orig
        ms = (time.perf_counter() - t0) * 1000
        a = int(np.argmax(p))
        return ACTIONS[a], dict(zip(ACTIONS, map(float, p))), ms, used


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", nargs="?", const="modes", default="",
                    help="export deltas: 'modes' (default: lambdas used by auto modes) or comma-separated lambdas")
    a = ap.parse_args()
    if a.export:
        export_deltas(None if a.export == "modes" else [float(x) for x in a.export.split(",")])
    mp = MultiPolicy()
    print(f"mode={mp.mode} lambdas={mp.lambdas}")
    for lam in mp.lambdas or [0.0]:
        print(lam, mp.route("Write a function that reverses a linked list in place.", lam))
