"""Pennywise arm of the router benchmark: OpenCode (the open agent CLI) with pennywise/<model> on every
task in bench/tasks.py. Cost = list price from measured tokens at the proxy (/health spend delta).
    uvicorn server.app:app --port 8000          # proxy with real tiers (other shell)
    python bench/run_pennywise.py --models auto,large
Writes eval/results/router_bench_pennywise.json (+ per-run transcripts in data/cache/bench_runs/).
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
from tasks import TASKS  # noqa: E402

PROXY = "http://127.0.0.1:8000"
OUT = ROOT / "eval" / "results" / "router_bench_pennywise.json"
LOGS = ROOT / "data" / "cache" / "bench_runs"


def health():
    h = httpx.get(f"{PROXY}/health", timeout=10).json()
    return h["spend_today"], dict(h["stats"]["by_tier"])


def tests_of(task):
    return {n: s for n, s in TASKS[task]["files"].items() if n.startswith("test_")}


def run(task, model, opencode, timeout):
    d = Path(tempfile.mkdtemp(prefix=f"pwb_{task}_{model}_"))
    for name, src in TASKS[task]["files"].items():
        (d / name).write_text(src, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=d)
    # PWD: OpenCode resolves its project from $PWD. DISABLE flags: don't load ~/.claude skills into every request.
    env = dict(os.environ, PWD=str(d), OPENCODE_DISABLE_CLAUDE_CODE="1", OPENCODE_DISABLE_EXTERNAL_SKILLS="1",
               PATH=str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", ""))
    s0, t0 = health()
    start = time.time()
    try:
        p = subprocess.run([opencode, "run", "-m", f"pennywise/{model}", TASKS[task]["ask"]], cwd=d, env=env,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        status, transcript = f"exit {p.returncode}", p.stdout + "\n--- stderr ---\n" + p.stderr
    except subprocess.TimeoutExpired as e:
        status, transcript = "timeout", (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
    wall = time.time() - start
    s1, t1 = health()
    untouched = all((d / n).read_text(encoding="utf-8") == s for n, s in tests_of(task).items())
    tests = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=d, capture_output=True, text=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    (LOGS / f"{task}_{model}_{time.strftime('%H%M')}.txt").write_text(re.sub(r"\x1b\[[0-9;]*m", "", transcript) + "\n--- pytest ---\n" + tests.stdout, encoding="utf-8")
    row = {"task": task, "level": TASKS[task]["level"], "arm": f"pennywise/{model}", "merged": tests.returncode == 0 and untouched,
           "tests_pass": tests.returncode == 0, "tests_untouched": untouched, "cost_usd": round(s1 - s0, 6),
           "tier_calls": {k: t1.get(k, 0) - t0.get(k, 0) for k in t1}, "wall_s": round(wall, 1), "status": status}
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps(row), flush=True)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="auto")
    ap.add_argument("--tasks", default=",".join(TASKS))
    ap.add_argument("--timeout", type=int, default=1500)
    ap.add_argument("--out", default=str(OUT), help="results file (use a new one for an independent repeat run)")
    a = ap.parse_args()
    out = Path(a.out)
    opencode = shutil.which("opencode") or sys.exit("opencode not on PATH (npm i -g opencode-ai)")
    old = json.load(open(out, encoding="utf-8"))["runs"] if out.exists() else []
    done = {(r["task"], r["arm"]) for r in old}
    rows = list(old)
    for t in a.tasks.split(","):
        for m in a.models.split(","):
            if (t, f"pennywise/{m}") not in done:  # resumable
                rows.append(run(t, m, opencode, a.timeout))
                out.write_text(json.dumps({"runs": rows}, indent=1), encoding="utf-8")
    hashes = {t: hashlib.sha256(json.dumps(TASKS[t], sort_keys=True).encode()).hexdigest()[:12] for t in TASKS}
    out.write_text(json.dumps({"label": "OpenCode CLI with Pennywise; list-price cost from measured tokens (actual spend $0, free shared endpoints).",
                               "task_hashes": hashes, "runs": rows}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
