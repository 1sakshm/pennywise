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
