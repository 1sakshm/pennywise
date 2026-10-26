"""ONNX Runtime serving for the multi-lambda router (CPU).

Mirrors the training split: one shared LOWER graph (embeddings + frozen layers, base Laya weights)
and one small UPPER graph per lambda (top-N layers + decision head, trained weights). Decisions
match PyTorch (checked by `--check`); ~1.5x faster on CPU (see DECISIONS.md).

    python -m router.onnx_serve --export          # writes SERVE_DIR/lower.onnx + upper_lam*.onnx
    python -m router.onnx_serve --check           # compares against router.serve_policy.MultiPolicy
Serving: server/state.py uses OnnxMultiPolicy when SERVE_DIR/lower.onnx exists (ROUTER_BACKEND=onnx|torch).
"""
import argparse
import json
import os
import threading
import time

import numpy as np
import torch

from router.laya_model import ACTIONS, BASE_MODEL, LayaPolicy
from router.serve_policy import N_TOP, SERVE_DIR, _clone_trainable


class _Lower(torch.nn.Module):
    def __init__(self, pol):
        super().__init__()
        self.pol, self.enc = pol, pol.model.encoder

    def forward(self, input_ids, attention_mask):
        h = self.enc.embeddings(input_ids=input_ids)
        masks, rope = self.pol._masks_and_rope(h, attention_mask)
        for layer in self.enc.layers[: len(self.enc.layers) - N_TOP]:
            h = layer(h, attention_mask=masks[layer.attention_type], position_embeddings=rope[layer.attention_type])
        return h


class _Upper(torch.nn.Module):
    def __init__(self, pol, model):
        super().__init__()
        self.pol, self.m = pol, model

    def forward(self, h, attention_mask, marker_pos, marker_mask):
        enc, m = self.m.encoder, self.m
        masks, rope = self.pol._masks_and_rope(h, attention_mask)
        for layer in enc.layers[len(enc.layers) - N_TOP:]:
            h = layer(h, attention_mask=masks[layer.attention_type], position_embeddings=rope[layer.attention_type])
        h = enc.final_norm(h)
        h = h + m.type_emb(torch.zeros(h.shape[0], dtype=torch.long))[:, None, :]
        pad = attention_mask == 0
        for layer in m.head.layers:
            h = layer(h, src_key_padding_mask=pad)
        idx = marker_pos[:, :, None].expand(-1, -1, h.size(-1))
        logits = m.scorer(torch.gather(h, 1, idx)).squeeze(-1)
        return torch.softmax(logits.masked_fill(~marker_mask, -1e4), -1)


def export(out_dir=SERVE_DIR):
    from safetensors.torch import load_file
    torch.set_grad_enabled(False)
    torch.backends.mha.set_fastpath_enabled(False)  # fused encoder-layer kernel has no ONNX export
    pol = LayaPolicy(BASE_MODEL, device="cpu")
    pol.amp = False
    b = pol.batch(["Write a function that reverses a list.", "What is 2+2?"])
    ids, att = b["input_ids"], b["attention_mask"]
    dyn = {0: "b", 1: "l"}
    torch.onnx.export(_Lower(pol).eval(), (ids, att), str(out_dir / "lower.onnx"), opset_version=17, dynamo=False,
                      input_names=["input_ids", "attention_mask"], output_names=["h"],
                      dynamic_axes={"input_ids": dyn, "attention_mask": dyn, "h": dyn})
    h = _Lower(pol)(ids, att)
    for f in sorted(out_dir.glob("rl_lam*.safetensors")):
        m = _clone_trainable(pol.model)
        m.load_state_dict({k: v.float() for k, v in load_file(str(f)).items()}, strict=False)
        lam = f.stem.replace("rl_lam", "")
        torch.onnx.export(_Upper(pol, m.eval()).eval(), (h, att, b["marker_pos"], b["marker_mask"]),
                          str(out_dir / f"upper_lam{lam}.onnx"), opset_version=17, dynamo=False,
                          input_names=["h", "attention_mask", "marker_pos", "marker_mask"], output_names=["probs"],
                          dynamic_axes={"h": dyn, "attention_mask": dyn, "marker_pos": {0: "b"}, "marker_mask": {0: "b"},
                                        "probs": {0: "b"}})
        print(f"exported upper_lam{lam}.onnx")
    print("exported lower.onnx")


class OnnxMultiPolicy:
    """Same interface as router.serve_policy.MultiPolicy (route / lambdas / mode / nearest)."""

    def __init__(self, serve_dir=SERVE_DIR, threads=None):
        import onnxruntime as ort
        from laya.agent import _fix_tokenizer_config
        from laya.train import resolve_checkpoint_dir
        from transformers import AutoTokenizer
        d = resolve_checkpoint_dir(BASE_MODEL)  # tokenizer + config only; all weights live in the ONNX graphs
        _fix_tokenizer_config(d)
        self.tok = AutoTokenizer.from_pretrained(os.path.join(d, "tokenizer"))
        self.cfg = json.load(open(os.path.join(d, "rl_agent_config.json"), encoding="utf-8"))
        self.max_len, self.head_max_len = self.cfg.get("max_len", 512), self.cfg.get("head_max_len", 192)
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads or int(os.environ.get("ROUTER_THREADS", os.cpu_count() or 4))
        prov = ["CPUExecutionProvider"]
        self.lower = ort.InferenceSession(str(serve_dir / "lower.onnx"), so, providers=prov)
        only = {float(x) for x in os.environ.get("SERVE_LAMBDAS", "").split(",") if x.strip()}
        self.uppers = {}
        for f in sorted(serve_dir.glob("upper_lam*.onnx")):
            lam = float(f.stem.replace("upper_lam", ""))
            if not only or lam in only:
                self.uppers[lam] = ort.InferenceSession(str(f), so, providers=prov)
        self.lambdas = sorted(self.uppers)
        self.mode = "rl-onnx" if self.lambdas else "none"
        self.lock = threading.Lock()

    def nearest(self, lam):
        return min(self.lambdas, key=lambda x: abs(x - lam)) if self.lambdas else None

    def _batch(self, prompt):
        from laya.common import QTYPES, build_sequence
        from router.laya_model import ROUTE_QUESTION
        ids, markers = build_sequence(self.tok, prompt, ROUTE_QUESTION, self.max_len, self.head_max_len)
        return (np.array([ids], np.int64), np.ones((1, len(ids)), np.int64), np.array([markers], np.int64),
                np.ones((1, len(markers)), bool), QTYPES)

    def route(self, prompt, lam):
        used = self.nearest(lam)
        t0 = time.perf_counter()
        ids, att, mpos, mmask, _ = self._batch(prompt)
        with self.lock:
            h = self.lower.run(None, {"input_ids": ids, "attention_mask": att})[0]
            p = self.uppers[used].run(None, {"h": h, "attention_mask": att, "marker_pos": mpos, "marker_mask": mmask})[0][0]
        ms = (time.perf_counter() - t0) * 1000
        a = int(np.argmax(p))
        return ACTIONS[a], dict(zip(ACTIONS, map(float, p))), ms, used


def check(n=24):
    from router.paths import PROMPTS
    from router.serve_policy import MultiPolicy
    P = [json.loads(l)["prompt"] for l in open(PROMPTS, encoding="utf-8")][:: max(1, 948 // n)][:n]
    tp, op = MultiPolicy(device="cpu"), OnnxMultiPolicy()
    for lam in op.lambdas:
        agree, dmax, tt, to = 0, 0.0, [], []
        for p in P:
            a1, p1, ms1, _ = tp.route(p, lam)
            a2, p2, ms2, _ = op.route(p, lam)
            agree += a1 == a2
            dmax = max(dmax, max(abs(p1[k] - p2[k]) for k in p1))
            tt.append(ms1)
            to.append(ms2)
        print(f"lam={lam:g}: argmax agreement {agree}/{len(P)}, max |dp| {dmax:.4f}, "
              f"median ms torch {np.median(tt):.0f} vs onnx {np.median(to):.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if a.export:
        export()
    if a.check:
        check()
