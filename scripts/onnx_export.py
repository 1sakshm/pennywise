"""Export a Laya routing policy to ONNX and compare speed/decisions with PyTorch on CPU (dev tool).
    python -m scripts.onnx_export [--ckpt DIR] [--out router/serve/policy.onnx]
"""
import argparse, json, time
import numpy as np, torch
from router.laya_model import LayaPolicy

class Wrap(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, input_ids, attention_mask, marker_pos, marker_mask):
        q = torch.zeros(input_ids.shape[0], dtype=torch.long)
        return torch.softmax(self.m(input_ids, attention_mask, marker_pos, marker_mask, q)[0], -1)

def main(a):
    torch.set_num_threads(a.threads)
    pol = LayaPolicy(a.ckpt, device="cpu")
    P = [json.loads(l)["prompt"] for l in open("data/processed/prompts.jsonl", encoding="utf-8")][::40][:24]
    b = pol.batch(P[:2])
    args = tuple(b[k] for k in ("input_ids", "attention_mask", "marker_pos", "marker_mask"))
    w = Wrap(pol.model).eval()
    torch.onnx.export(w, args, a.out, input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask"],
                      output_names=["probs"], opset_version=17, dynamo=False,
                      dynamic_axes={"input_ids": {0: "b", 1: "l"}, "attention_mask": {0: "b", 1: "l"},
                                    "marker_pos": {0: "b"}, "marker_mask": {0: "b"}, "probs": {0: "b"}})
    import onnxruntime as ort
    so = ort.SessionOptions(); so.intra_op_num_threads = a.threads
    sess = ort.InferenceSession(a.out, so, providers=["CPUExecutionProvider"])
    def run_ort(p):
        bb = pol.batch([p]); return sess.run(None, {k: bb[k].numpy() for k in ("input_ids", "attention_mask", "marker_pos", "marker_mask")})[0][0]
    for tag, fn in (("torch", lambda p: pol.probs([p])[0]), ("onnx", run_ort)):
        fn(P[0]); ts, out = [], []
        for p in P:
            t = time.perf_counter(); out.append(fn(p)); ts.append((time.perf_counter() - t) * 1000)
        print(f"{tag:5s} threads={a.threads} median {np.median(ts):.0f} ms  p95 {np.percentile(ts, 95):.0f} ms")
        if tag == "torch": ref = np.array(out)
    o = np.array(out)
    print("argmax agreement:", (ref.argmax(1) == o.argmax(1)).mean(), " max |dp|:", np.abs(ref - o).max().round(4))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="convaiinnovations/laya")
    ap.add_argument("--out", default="data/cache/policy.onnx")
    ap.add_argument("--threads", type=int, default=8)
    main(ap.parse_args())
