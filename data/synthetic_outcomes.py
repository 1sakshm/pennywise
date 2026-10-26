"""DEV ONLY: fabricate a plausible outcomes table so downstream phases can be built and
tested before real model runs exist. Writes data/cache/synthetic/outcomes.jsonl (gitignored).

Nothing produced from this file may appear in the README, paper, site, or posts.
Model: P(correct | prompt, tier) = sigmoid(skill[tier] - difficulty(prompt)), where difficulty
depends on source and prompt length so the router has a learnable signal.
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "data" / "cache" / "synthetic" / "outcomes.jsonl"
PROMPTS = ROOT / "data" / "processed" / "prompts.jsonl"

SKILL = {"small": 0.0, "medium": 1.3, "large": 2.4}
PRICE = {"small": (0.05, 0.10), "medium": (0.30, 0.60), "large": (1.00, 3.00)}  # fake $/1M in, out
OUT_TOKENS = {"math": 600, "mmlu_pro": 200, "gsm8k": 250, "arc": 120, "mbpp": 200, "alan_bugfix": 220, "alan_triage": 90}
SRC_DIFF = {"math": 1.6, "mmlu_pro": 1.0, "gsm8k": 0.2, "arc": -0.3, "mbpp": 0.4, "alan_bugfix": 0.6, "alan_triage": 0.9}


def main():
    rng = random.Random(0)
    recs = [json.loads(l) for l in open(PROMPTS, encoding="utf-8")]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        for r in recs:
            d = SRC_DIFF[r["source"]] + 0.8 * math.log(len(r["prompt"]) / 300) + rng.gauss(0, 0.9)
            for t, s in SKILL.items():
                p = 1 / (1 + math.exp(-(s - d)))
                tin = len(r["prompt"]) // 4 + 40
                tout = int(OUT_TOKENS[r["source"]] * rng.uniform(0.6, 1.5) * (1.3 if t == "large" else 1))
                cost = (tin * PRICE[t][0] + tout * PRICE[t][1]) / 1e6
                f.write(json.dumps({
                    "prompt_id": r["id"], "tier": t, "source": r["source"], "split": r["split"],
                    "correct": rng.random() < p, "input_tokens": tin, "output_tokens": tout,
                    "cost_usd": cost, "latency_ms": round(tout * (8, 15, 25)[list(SKILL).index(t)] + 200, 1),
                    "model": f"SYNTHETIC-{t}", "raw_output": "SYNTHETIC", "synthetic": True}) + "\n")
    print(f"wrote SYNTHETIC outcomes for {len(recs)} prompts to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
