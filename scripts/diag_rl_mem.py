"""Diagnose RL step memory/speed on the cached path (dev tool)."""
import time, numpy as np, torch
from router.data import load_table
from router.laya_model import LayaPolicy
from router.paths import CKPTS
tab = load_table(); tr = tab.idx("train")
base = LayaPolicy(); cache = base.lower_cache(tab.prompts, 4); del base; torch.cuda.empty_cache()
lens = np.array([c["h"].shape[0] for c in cache]); print("seq len: median", np.median(lens), "p95", np.percentile(lens, 95), "max", lens.max())
pol = LayaPolicy(str(CKPTS / "sft")); params = pol.prepare_for_training(4, offload_frozen=True)
opt = torch.optim.AdamW(params, lr=1e-6)
print("after setup: alloc %.2f GB reserved %.2f GB" % (torch.cuda.memory_allocated()/2**30, torch.cuda.memory_reserved()/2**30))
rng = np.random.default_rng(0); pol.model.train()
for step in range(30):
    rows = rng.choice(tr, 16, replace=False)
    torch.cuda.synchronize(); t = time.perf_counter()
    lg = pol.logits_cached([cache[i] for i in rows], 4); loss = lg.logsumexp(-1).mean()
    opt.zero_grad(); loss.backward(); opt.step(); torch.cuda.synchronize()
    if step % 5 == 0:
        print("step %d L=%d %.0f ms  alloc %.2f peak %.2f reserved %.2f GB" % (step, lens[rows].max(), (time.perf_counter()-t)*1000,
              torch.cuda.memory_allocated()/2**30, torch.cuda.max_memory_allocated()/2**30, torch.cuda.memory_reserved()/2**30))
