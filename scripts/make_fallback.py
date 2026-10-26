"""Record ~20 genuine Live Mode runs for the frontend's fallback mode -> web/public/data/demo_fallback.json.

Every example is a real call: /route on the running server (trained policy, `auto` lambda), then
/answer on the chosen tier. Prompts: a stratified sample of held-out test prompts + a few
everyday requests. Run against a server with real tiers configured:
    uvicorn server.app:app --port 8000   (other shell)
    python scripts/make_fallback.py --url http://127.0.0.1:8000
"""
import argparse
import json
import random
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from router.paths import PROMPTS  # noqa: E402

EVERYDAY = [
    "What is the capital of Australia?",
    "Write a Python function that checks whether a string is a valid IPv4 address.",
    "Explain the difference between a process and a thread in two sentences.",
    "A tank fills in 6 hours with pipe A and 9 hours with pipe B. Pipe C empties it in 12 hours. With all three open, how long to fill it?",
    "Rewrite this commit message to be clearer: 'fix stuff in parser'",
    "Prove that the square root of 2 is irrational.",
]


def main(a):
    rng = random.Random(0)
    recs = [json.loads(l) for l in open(PROMPTS, encoding="utf-8") if json.loads(l)["split"] == "test"]
    by = {}
    for r in recs:
        by.setdefault(r["source"], []).append(r)
    prompts = EVERYDAY + [r["prompt"] for s in sorted(by) for r in rng.sample(by[s], 3)]
    prompts = [p for p in prompts if len(p) <= 3500][: a.n]
    c = httpx.Client(base_url=a.url, timeout=120)
    lam = c.get("/health").json()["modes"]["auto"]
    out = []
    for p in prompts:
        r = c.post("/route", json={"prompt": p, "lambda": lam}).json()
        if not r.get("ok"):
            print("route failed:", r)
            continue
        ans, done = "", None
        with c.stream("POST", "/answer", json={"prompt": p, "tier": r["action"]}) as s:
            for line in s.iter_lines():
                if line.startswith("data:"):
                    ev = json.loads(line[5:])
                    ans += ev.get("delta", "")
                    done = ev if ev.get("done") else done
        if not done:
            print("answer failed for:", p[:60])
            continue
        out.append({"prompt": p, "probs": r["probs"], "action": r["action"], "router_latency_ms": r["router_latency_ms"],
                    "answer": ans, "cost_usd": done["cost_usd"], "large_cost_usd": done["large_cost_usd"],
                    "usage_measured": done["usage_measured"], "lambda": r["lambda_used"]})
        print(f"{r['action']:6s} {r['router_latency_ms']:6.0f} ms  ${done['cost_usd']:.6f}  {p[:60]!r}")
    dest = ROOT / "web" / "public" / "data" / "demo_fallback.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(dest, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"wrote {len(out)} recorded runs to {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--n", type=int, default=21)
    main(ap.parse_args())
