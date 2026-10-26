"""Cache per-prompt features used by baselines and the UMAP galaxy (no API calls).

Writes data/cache/features.npz with, aligned to prompts.jsonl order:
  ids, laya_emb [N,1024] (frozen base Laya encoder, mean-pooled),
  st_emb [N,384] (sentence-transformers/all-MiniLM-L6-v2), zeroshot_probs [N,3], zeroshot_ms [N]
Usage: python -m eval.features
"""
import json
import time
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "data" / "processed" / "prompts.jsonl"
OUT = ROOT / "data" / "cache" / "features.npz"
ST_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def load_prompts():
    return [json.loads(l) for l in open(PROMPTS, encoding="utf-8")]


def load_features():
    f = np.load(OUT, allow_pickle=False)
    return {k: f[k] for k in f.files}


def main():
    from sentence_transformers import SentenceTransformer

    from router.laya_model import LayaPolicy

    torch.manual_seed(0)
    recs = load_prompts()
    texts = [r["prompt"] for r in recs]
    pol = LayaPolicy()
    t0 = time.perf_counter()
    laya_emb = pol.embed(texts)
    print(f"laya embeddings {laya_emb.shape} in {time.perf_counter() - t0:.1f}s")

    pol.score("warmup")
    probs, ms = [], []
    for t in texts:  # one at a time so the latency is per-request, as the router would see it
        if pol.device.type == "cuda":
            torch.cuda.synchronize()
        t0 = time.perf_counter()
        probs.append(pol.probs([t])[0])
        ms.append((time.perf_counter() - t0) * 1000)
    print(f"zero-shot probs: median {np.median(ms):.1f} ms, p95 {np.percentile(ms, 95):.1f} ms")

    st = SentenceTransformer(ST_MODEL, device=str(pol.device))
    st_emb = st.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
    print(f"{ST_MODEL} embeddings {st_emb.shape}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT, ids=np.array([r["id"] for r in recs]), laya_emb=laya_emb.astype(np.float32),
                        st_emb=st_emb.astype(np.float32), zeroshot_probs=np.array(probs, dtype=np.float32),
                        zeroshot_ms=np.array(ms, dtype=np.float32))
    zs = np.array(probs).argmax(1)
    print("zero-shot action counts:", dict(zip(["small", "medium", "large"], np.bincount(zs, minlength=3).tolist())))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
