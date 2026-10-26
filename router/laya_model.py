"""Laya as a routing policy pi(a|s).

Uses Laya's own checkpoint loader and sequence builder (laya.train / laya.common), so the
input is exactly what Laya was trained on:
    [CLS] choice question: <instructions> [SEP] [MASK] opt0 [MASK] opt1 [MASK] opt2 [SEP] <prompt> [SEP]
and the logit for each option is read at its [MASK] marker. One forward pass returns the full
action distribution, which is what makes policy-gradient training cheap.
See docs/LAYA_NOTES.md.
"""
import time
from typing import Dict, List, Optional

import numpy as np
import torch
from torch.utils.checkpoint import checkpoint
from laya.common import QTYPES, build_sequence, collate_items
from laya.train import load_checkpoint, save_checkpoint

BASE_MODEL = "convaiinnovations/laya"

ACTIONS = ["small", "medium", "large"]
# A `choice` question: keys are the action names, values are short natural-language
# descriptions (Laya renders each as "key: description"). Kept to 3 options - Laya is
# strongest with a small option set.
ROUTE_QUESTION = {
    "t": "choice",
    "ins": "Which is the cheapest AI model that will still answer this request correctly?",
    "crit": {
        "small": "a small fast model is enough",
        "medium": "needs a medium model",
        "large": "needs the strongest model",
    },
}


class LayaPolicy:
    def __init__(self, model_dir: str = BASE_MODEL, device: Optional[str] = None, max_len: Optional[int] = None):
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        self.model, self.tok, self.cfg = load_checkpoint(model_dir)
        self.model.to(self.device).eval()
        self.max_len = max_len or self.cfg.get("max_len", 512)
        self.head_max_len = self.cfg.get("head_max_len", 192)
        self.amp = self.device.type == "cuda"

    # ------------------------------------------------------------------ encoding
    def batch(self, prompts: List[str], question: Dict = ROUTE_QUESTION):
        items = []
        for p in prompts:
            ids, markers = build_sequence(self.tok, p, question, self.max_len, self.head_max_len)
            items.append([{"ids": ids, "markers": markers, "qtype": QTYPES[question["t"]]}])
        return collate_items(items, self.tok.pad_token_id)

    def logits(self, prompts: List[str], question: Dict = ROUTE_QUESTION) -> torch.Tensor:
        """Raw option logits [B, K]; differentiable when called with grad enabled."""
        b = self.batch(prompts, question)
        args = [b[k].to(self.device) for k in ("input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype")]
        with torch.autocast(self.device.type, dtype=torch.bfloat16, enabled=self.amp):
            logits, _act = self.model(*args)
        return logits.float()

    # ------------------------------------------------------------------ inference API
    @torch.no_grad()
    def probs(self, prompts: List[str], question: Dict = ROUTE_QUESTION, batch_size: int = 16) -> np.ndarray:
        out = []
        for i in range(0, len(prompts), batch_size):
            out.append(torch.softmax(self.logits(prompts[i:i + batch_size], question), -1).cpu().numpy())
        return np.concatenate(out)

    def score(self, prompt: str, options: Optional[List[str]] = None) -> Dict[str, float]:
        """{option: prob}. `options` defaults to the 3 router tiers; other lists use empty descriptions."""
        q = ROUTE_QUESTION if options is None else {**ROUTE_QUESTION, "crit": {o: None for o in options}}
        p = self.probs([prompt], q)[0]
        return dict(zip(q["crit"].keys(), map(float, p)))

    @torch.no_grad()
    def embed(self, prompts, batch_size: int = 16) -> np.ndarray:
        """Mean-pooled last-layer encoder states of the prompt alone (no question head)."""
        single = isinstance(prompts, str)
        prompts = [prompts] if single else list(prompts)
        out = []
        for i in range(0, len(prompts), batch_size):
            enc = self.tok(prompts[i:i + batch_size], truncation=True, max_length=self.max_len,
                           padding=True, return_tensors="pt").to(self.device)
            with torch.autocast(self.device.type, dtype=torch.bfloat16, enabled=self.amp):
                h = self.model.encoder(**enc).last_hidden_state.float()
            m = enc["attention_mask"].unsqueeze(-1).float()
            out.append(((h * m).sum(1) / m.sum(1)).cpu().numpy())
        e = np.concatenate(out)
        return e[0] if single else e

    def prepare_for_training(self, n_top_layers: int, offload_frozen: bool = False):
        """Train the top `n_top_layers` encoder layers + decision head; freeze the rest.

        Sized for a 4 GB GPU: frozen modules hold no grads/optimizer state and store no
        activations; the act/escalate head is frozen (unused, see LAYA_NOTES.md).
        offload_frozen=True (for the cached path, which never runs the lower layers) moves the
        embeddings + lower layers to CPU in fp32: frees ~1.2 GB VRAM and keeps them exact, so
        saved checkpoints hold the original frozen weights. Otherwise they're cast to bf16 on GPU.
        Returns the trainable parameters.
        """
        m, enc = self.model, self.model.encoder
        for p in m.parameters():
            p.requires_grad_(False)
        trainable = [*enc.layers[len(enc.layers) - n_top_layers:], enc.final_norm, m.head, m.type_emb, m.scorer]
        for mod in trainable:
            for p in mod.parameters():
                p.requires_grad_(True)
        if self.device.type == "cuda":  # make the allocator free its cache instead of spilling (WDDM)
            torch.cuda.set_per_process_memory_fraction(0.85)
        frozen = [enc.embeddings, *enc.layers[: len(enc.layers) - n_top_layers]]
        if offload_frozen:
            for mod in frozen:
                mod.to("cpu")
            torch.cuda.empty_cache()
        elif self.amp:
            for mod in frozen:
                mod.to(torch.bfloat16)
        m.head_checkpointing = True
        return [p for p in m.parameters() if p.requires_grad]

    # ------------------------------------------------------------------ cached split forward
    # The bottom (L - n_top) encoder layers are frozen during SFT/RL, so their output for a
    # prompt never changes. We run them once, cache the hidden states, and train/evaluate by
    # running only the top layers + decision head. Mirrors ModernBertModel.forward and
    # DecisionModel.forward exactly (checked against the full forward in `check_cache`).
    def _masks_and_rope(self, h, att):
        from transformers.masking_utils import create_bidirectional_mask, create_bidirectional_sliding_window_mask
        enc = self.model.encoder
        kw = {"config": enc.config, "inputs_embeds": h, "attention_mask": att}
        masks = {"full_attention": create_bidirectional_mask(**kw),
                 "sliding_attention": create_bidirectional_sliding_window_mask(**kw)}
        pos = torch.arange(h.shape[1], device=h.device).unsqueeze(0)
        rope = {t: enc.rotary_emb(h, pos, t) for t in set(enc.config.layer_types)}
        return masks, rope

    @torch.no_grad()
    def lower_cache(self, prompts: List[str], n_top: int, batch_size: int = 16, question: Dict = ROUTE_QUESTION):
        """Per prompt: {'h': [len, d] bf16 CPU hidden state after layer L-n_top, 'markers': [...]}."""
        enc = self.model.encoder
        k = len(enc.layers) - n_top
        out = []
        for i in range(0, len(prompts), batch_size):
            b = self.batch(prompts[i:i + batch_size], question)
            ids, att = b["input_ids"].to(self.device), b["attention_mask"].to(self.device)
            with torch.autocast(self.device.type, dtype=torch.bfloat16, enabled=self.amp):
                h = enc.embeddings(input_ids=ids)
                masks, rope = self._masks_and_rope(h, att)
                for layer in enc.layers[:k]:
                    h = layer(h, attention_mask=masks[layer.attention_type],
                              position_embeddings=rope[layer.attention_type])
            lens = att.sum(1).tolist()
            for j, n in enumerate(lens):
                m = b["marker_pos"][j][b["marker_mask"][j]].tolist()
                out.append({"h": h[j, :n].to("cpu", torch.bfloat16).clone(), "markers": m})
        return out

    def logits_cached(self, items, n_top: int) -> torch.Tensor:
        """Option logits [B, K] from cached lower hidden states; differentiable in the top layers + head."""
        enc, m = self.model.encoder, self.model
        k0 = len(enc.layers) - n_top
        B, L, d = len(items), max(it["h"].shape[0] for it in items), items[0]["h"].shape[1]
        K = max(len(it["markers"]) for it in items)
        h = torch.zeros(B, L, d, dtype=torch.bfloat16)
        att = torch.zeros(B, L, dtype=torch.long)
        mpos = torch.zeros(B, K, dtype=torch.long)
        mmask = torch.zeros(B, K, dtype=torch.bool)
        for i, it in enumerate(items):
            n = it["h"].shape[0]
            h[i, :n], att[i, :n] = it["h"], 1
            mpos[i, :len(it["markers"])] = torch.tensor(it["markers"])
            mmask[i, :len(it["markers"])] = True
        h, att, mpos, mmask = (x.to(self.device) for x in (h, att, mpos, mmask))
        qtype = torch.zeros(B, dtype=torch.long, device=self.device)  # 'choice'
        # Activation checkpointing while training: recompute each layer in backward instead of
        # storing its activations (peak 3.5 GB -> fits a 4 GB GPU without spilling).
        ckpt = self.model.training and torch.is_grad_enabled()
        run = (lambda f, *a, **k: checkpoint(f, *a, use_reentrant=False, **k)) if ckpt else (lambda f, *a, **k: f(*a, **k))
        with torch.autocast(self.device.type, dtype=torch.bfloat16, enabled=self.amp):
            masks, rope = self._masks_and_rope(h, att)
            for layer in enc.layers[k0:]:
                h = run(layer, h, attention_mask=masks[layer.attention_type], position_embeddings=rope[layer.attention_type])
            h = enc.final_norm(h)
            # --- DecisionModel.forward, head part (option_ids=None path)
            h = h + m.type_emb(qtype)[:, None, :]
            pad = ~att.bool()
            for layer in m.head.layers:
                h = run(layer, h, src_key_padding_mask=pad)
            idx = mpos.clamp(min=0)[:, :, None].expand(-1, -1, h.size(-1))
            logits = m.scorer(torch.gather(h, 1, idx)).squeeze(-1).float()
        return logits.masked_fill(~mmask, -1e4)

    @torch.no_grad()
    def probs_cached(self, items, n_top: int, batch_size: int = 32) -> np.ndarray:
        out = [torch.softmax(self.logits_cached(items[i:i + batch_size], n_top), -1).cpu().numpy()
               for i in range(0, len(items), batch_size)]
        return np.concatenate(out)

    @torch.no_grad()
    def check_cache(self, prompts: List[str], n_top: int) -> float:
        """Max |prob difference| between the full forward and the cached split forward."""
        full = self.probs(prompts)
        split = self.probs_cached(self.lower_cache(prompts, n_top), n_top)
        return float(np.abs(full - split).max())

    def save(self, path: str):
        save_checkpoint(self.model, self.tok, self.cfg, path)


if __name__ == "__main__":
    import laya

    samples = [
        "What is 7 + 5?",
        "Translate 'good morning' into French.",
        "Write a Python function that returns the n-th Fibonacci number using memoization.",
        "A train leaves at 3:40 PM travelling 84 km/h; a second leaves the same station at 4:10 PM at 105 km/h. "
        "At what time does the second train catch the first?",
        "Prove that there are infinitely many primes p such that p ≡ 3 (mod 4), and discuss whether the argument "
        "generalises to p ≡ 1 (mod 4).",
    ]
    t0 = time.perf_counter()
    pol = LayaPolicy()
    print(f"loaded {BASE_MODEL} on {pol.device} in {time.perf_counter() - t0:.1f}s "
          f"(max_len={pol.max_len}, head_max_len={pol.head_max_len})")
    pol.score("warmup")
    for s in samples:
        t0 = time.perf_counter()
        p = pol.score(s)
        ms = (time.perf_counter() - t0) * 1000
        print(f"{ms:6.1f} ms  " + "  ".join(f"{k}={v:.3f}" for k, v in p.items()) + f"   | {s[:60]}")
    t0 = time.perf_counter()
    e = pol.embed(samples)
    print(f"embed: shape {e.shape} in {(time.perf_counter() - t0) * 1000:.0f} ms")

    # Cross-check our encoding against Laya's official inference path (it applies its fitted
    # temperature, so compare argmax rather than exact probabilities).
    agent = laya.load(BASE_MODEL)
    qs = {"tier": {"type": "choice", "instructions": ROUTE_QUESTION["ins"], "criteria": ROUTE_QUESTION["crit"]}}
    agree = 0
    for s in samples:
        off = agent.predict(s, qs)["answers"]["tier"]
        ours = max(pol.score(s).items(), key=lambda kv: kv[1])[0]
        agree += off["choice"] == ours
        print(f"official: {off['choice']:6s} {np.round(list(off['probabilities'].values()) if isinstance(off['probabilities'], dict) else off['probabilities'], 3)}  ours: {ours}")
    print(f"argmax agreement with laya.Agent.predict: {agree}/{len(samples)}")
