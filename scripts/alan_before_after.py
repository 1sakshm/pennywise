"""Before/after cost of agent coding tasks: OpenCode (the agent CLI Alan drives) with
`pennywise/large` (no routing, "before") vs `pennywise/auto` (routed, "after").

Each task is a tiny repo with a bug or missing function and a pytest suite. For every
(task, model) we copy the template to a fresh folder, run `opencode run -m pennywise/<m> <instruction>`,
measure list-price cost at the proxy (/health spend delta; calls bill $0 on the free API),
wall-clock time, and whether the tests pass afterwards ("would merge").
Small live demo, n = 4 tasks: not a benchmark.

    uvicorn server.app:app --port 8000      # proxy with real tiers (other shell)
    python scripts/alan_before_after.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
PROXY = "http://127.0.0.1:8000"
OUT = ROOT / "eval" / "results" / "alan_before_after.json"

TASKS = {
    "off_by_one": {
        "files": {"mathx.py": "def sum_to(n):\n    \"\"\"Return 1 + 2 + ... + n.\"\"\"\n    return sum(range(1, n))\n",
                  "test_mathx.py": "from mathx import sum_to\n\ndef test_sum():\n    assert sum_to(1) == 1\n    assert sum_to(4) == 10\n    assert sum_to(0) == 0\n"},
        "ask": "The tests in test_mathx.py fail. Fix the bug in mathx.py so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "slugify": {
        "files": {"text.py": "def slugify(s):\n    raise NotImplementedError\n",
                  "test_text.py": "from text import slugify\n\ndef test_slug():\n    assert slugify('Hello World') == 'hello-world'\n"
                                  "    assert slugify('  Many   spaces  ') == 'many-spaces'\n    assert slugify('C++ & Rust!') == 'c-rust'\n"},
        "ask": "Implement slugify in text.py (lowercase, words joined by single hyphens, non-alphanumerics removed) so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "parse_kv": {
        "files": {"kv.py": "def parse_kv(line):\n    \"\"\"Parse 'a=1;b=2' into a dict of strings.\"\"\"\n    out = {}\n    for part in line.split(';'):\n"
                           "        k, v = part.split('=')\n        out[k.strip()] = v.strip()\n    return out\n",
                  "test_kv.py": "from kv import parse_kv\n\ndef test_basic():\n    assert parse_kv('a=1;b=2') == {'a': '1', 'b': '2'}\n\n"
                                "def test_equals_in_value():\n    assert parse_kv('url=http://x?y=1') == {'url': 'http://x?y=1'}\n\n"
                                "def test_trailing():\n    assert parse_kv('a=1;') == {'a': '1'}\n"},
        "ask": "test_kv.py fails: values may contain '=' and lines may end with ';'. Fix kv.py so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "palindrome": {
        "files": {"pal.py": "def is_palindrome(s):\n    return s == s[::-1]\n",
                  "test_pal.py": "from pal import is_palindrome\n\ndef test_pal():\n    assert is_palindrome('A man, a plan, a canal: Panama')\n"
                                 "    assert not is_palindrome('hello')\n    assert is_palindrome('')\n"},
        "ask": "Make is_palindrome in pal.py ignore case and non-alphanumeric characters so `python -m pytest -q` passes. Do not edit the tests.",
    },
}


def health():
    h = httpx.get(f"{PROXY}/health", timeout=10).json()
    return h["spend_today"], dict(h["stats"]["by_tier"]), h["stats"]["requests_routed"]


def run(task, model, opencode):
    d = Path(tempfile.mkdtemp(prefix=f"pw_{task}_{model}_"))
    for name, src in TASKS[task]["files"].items():
        (d / name).write_text(src, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=d)  # OpenCode resolves the project from the git root; isolate each run
    s0, t0, n0 = health()
    start = time.time()
    try:
        # same environment for both arms: this interpreter (with pytest) first on the agent's PATH
        # PWD: OpenCode resolves its project from $PWD, not the process cwd. The DISABLE flags stop it loading
        # ~/.claude skills/prompts into every request (identical for both arms).
        env = dict(os.environ, PWD=str(d), OPENCODE_DISABLE_CLAUDE_CODE="1", OPENCODE_DISABLE_EXTERNAL_SKILLS="1",
                   PATH=str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", ""))
        p = subprocess.run([opencode, "run", "-m", f"pennywise/{model}", TASKS[task]["ask"]], cwd=d, env=env,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1500)  # the free medium endpoint can take >60 s per step
        status = f"exit {p.returncode}"
    except subprocess.TimeoutExpired:
        status = "timeout"
    wall = time.time() - start
    s1, t1, n1 = health()
    tests = subprocess.run([sys.executable, "-m", "pytest", "-q"], cwd=d, capture_output=True, text=True)
    row = {"task": task, "model": f"pennywise/{model}", "passed": tests.returncode == 0, "cost_usd": round(s1 - s0, 6),
           "requests": n1 - n0, "by_tier": {k: t1.get(k, 0) - t0.get(k, 0) for k in t1}, "wall_s": round(wall, 1), "opencode": status}
    log = ROOT / "data" / "cache" / "alan_runs" / f"{task}_{model}.txt"
    log.parent.mkdir(parents=True, exist_ok=True)
    agent = p.stdout + "\n--- stderr ---\n" + p.stderr if status != "timeout" else "timeout"
    log.write_text(agent + "\n--- pytest ---\n" + tests.stdout + tests.stderr, encoding="utf-8")
    row["log"] = str(log.relative_to(ROOT))
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps(row))
    return row


def main():
    opencode = shutil.which("opencode")
    if not opencode:
        raise SystemExit("opencode not on PATH (npm i -g opencode-ai)")
    rows = [run(t, m, opencode) for t in TASKS for m in ("large", "auto")]
    summ = {}
    for m in ("pennywise/large", "pennywise/auto"):
        r = [x for x in rows if x["model"] == m]
        ok = sum(x["passed"] for x in r)
        cost = sum(x["cost_usd"] for x in r)
        summ[m] = {"tasks": len(r), "passed": ok, "total_cost_usd": round(cost, 6),
                   "usd_per_passing_task": round(cost / ok, 6) if ok else None, "total_wall_s": round(sum(x["wall_s"] for x in r), 1)}
    b, a = summ["pennywise/large"], summ["pennywise/auto"]
    out = {"n_tasks": len(TASKS), "usd_per_merged_pr": {"before": b["usd_per_passing_task"], "after": a["usd_per_passing_task"]},
           "label": "Small live demo, n = 4 tasks — not a benchmark. OpenCode CLI run directly (the agent CLI Alan drives), not inside an Alan session.",
           "cost_basis": "list price at the proxy from measured tokens; actual spend $0 (free API)", "runs": rows, "summary": summ}
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main()
