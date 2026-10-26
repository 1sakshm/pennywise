"""CPU router latency: fp32 vs int8 dynamic quantization (dev tool)."""
import json, time, numpy as np, torch
from router.laya_model import LayaPolicy
P = [json.loads(l)["prompt"] for l in open("data/processed/prompts.jsonl", encoding="utf-8")][::40][:24]
torch.set_num_threads(int(__import__("os").environ.get("THREADS", "4")))
pol = LayaPolicy(device="cpu")
def bench(tag):
    pol.score(P[0]); ts = []
    for p in P:
        t = time.perf_counter(); pol.probs([p]); ts.append((time.perf_counter() - t) * 1000)
    print(f"{tag:6s} threads={torch.get_num_threads()} median {np.median(ts):.0f} ms  p95 {np.percentile(ts, 95):.0f} ms")
    return np.array([pol.probs([p])[0] for p in P])
a = bench("fp32")
pol.model.encoder = torch.ao.quantization.quantize_dynamic(pol.model.encoder, {torch.nn.Linear}, dtype=torch.qint8)  # head stays fp32 (nn.TransformerEncoderLayer fast path)
b = bench("int8")
print("argmax agreement fp32 vs int8:", (a.argmax(1) == b.argmax(1)).mean(), " max |dp|:", np.abs(a - b).max().round(3))
