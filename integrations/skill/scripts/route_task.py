#!/usr/bin/env python3
"""Helper for the laya-router agent skill. Stdlib only, so it runs anywhere an agent has Python.

usage: route_task.py [--mode auto|auto-cheap|auto-quality] [--route-only] PROMPT
Prints JSON: {answer, tier, confidence, router_latency_ms, estimated_savings_usd} or {error}.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("LAYA_ROUTER_URL", "http://127.0.0.1:8000").rstrip("/")


def post(path, body, timeout):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer unused"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read()), dict(r.headers)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="+")
    ap.add_argument("--mode", default="auto", choices=["auto", "auto-cheap", "auto-quality"])
    ap.add_argument("--route-only", action="store_true")
    a = ap.parse_args()
    prompt = " ".join(a.prompt)
    try:
        if a.route_only:
            with urllib.request.urlopen(URL + "/health", timeout=10) as r:
                lam = json.loads(r.read()).get("modes", {}).get(a.mode, 0.25)
            j, _ = post("/route", {"prompt": prompt, "lambda": lam}, 30)
            out = {"tier": j["action"], "confidence": round(j["probs"][j["action"]], 3),
                   "router_latency_ms": j["router_latency_ms"]} if j.get("ok") else {"error": j.get("message")}
        else:
            j, h = post("/v1/chat/completions", {"model": a.mode, "messages": [{"role": "user", "content": prompt}]}, 180)
            h = {k.lower(): v for k, v in h.items()}
            out = {"answer": j["choices"][0]["message"].get("content"), "tier": h.get("x-router-tier"),
                   "confidence": h.get("x-router-confidence"), "router_latency_ms": h.get("x-router-latency-ms"),
                   "estimated_savings_usd": h.get("x-estimated-savings-usd")}
    except (urllib.error.URLError, OSError, KeyError, ValueError) as e:
        print(json.dumps({"error": f"router unavailable: {e}"}))
        sys.exit(1)
    print(json.dumps(out, indent=1))
    sys.exit(1 if "error" in out else 0)


if __name__ == "__main__":
    main()
