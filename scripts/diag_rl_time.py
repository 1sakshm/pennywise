"""Split RL step time into phases (dev tool)."""
import time, numpy as np, torch
from router.data import load_table
from router.laya_model import LayaPolicy
from router.paths import CKPTS
tab = load_table(); tr = tab.idx("train")
base = LayaPolicy(); cache = base.lower_cache(tab.prompts, 4); del base; torch.cuda.empty_cache()
pol = LayaPolicy(str(CKPTS / "sft")); params = pol.prepare_for_training(4, offload_frozen=True)
opt = torch.optim.AdamW(params, lr=1e-6); rng = np.random.default_rng(0); pol.model.train()
T = {"fwd": [], "bwd": [], "opt": []}
for step in range(25):
    rows = rng.choice(tr, 16, replace=False)
    s = lambda: torch.cuda.synchronize() or time.perf_counter()
    t0 = s(); lg = pol.logits_cached([cache[i] for i in rows], 4); loss = lg.logsumexp(-1).mean(); t1 = s()
    opt.zero_grad(); loss.backward(); t2 = s(); opt.step(); t3 = s()
    if step >= 3:
        T["fwd"].append(t1-t0); T["bwd"].append(t2-t1); T["opt"].append(t3-t2)
for k, v in T.items(): print(k, "median %.0f ms  max %.0f ms" % (1000*np.median(v), 1000*max(v)))
print("gpu clocks:"); import subprocess; print(subprocess.run(["nvidia-smi","--query-gpu=clocks.sm,clocks.max.sm,power.draw,temperature.gpu,pstate","--format=csv"],capture_output=True,text=True).stdout)
