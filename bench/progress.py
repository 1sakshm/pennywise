"""Live progress bars for the Pennywise benchmark runs, with a rough time-left estimate.
    python bench/progress.py          # one snapshot
    python bench/progress.py --watch  # refresh every 10 s (Ctrl+C to stop)
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
from tasks import TASKS  # noqa: E402

RUNS = [("large tier", ROOT / "data/cache/bench_pw_large.log"),
        ("auto (daytime rerun)", ROOT / "data/cache/bench_pw_day.log"),
        ("auto + cascade (v0.2)", ROOT / "data/cache/bench_pw_cascade.log"),
        ("auto + cascade v0.2b", ROOT / "data/cache/bench_pw_cascade2.log")]
N = len(TASKS)


def rows(log):
    out = []
    if log.exists():
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith('{"task"'):
                out.append(json.loads(line))
    return out


def bar(done, width=30):
    k = int(width * done / N)
    return "█" * k + "░" * (width - k)


def snapshot():
    lines, queued_eta = [], 0.0
    for name, log in RUNS:
        r = rows(log)
        done, merged = len(r), sum(x["merged"] for x in r)
        avg = sum(x["wall_s"] for x in r) / done if done else None
        started = log.exists() and log.stat().st_size > 0
        if done >= N:
            status = "done"
        elif not started:
            est = queued_eta + N * (avg or 150)
            status = f"queued · ~{est / 60:.0f} min after the run above"
        else:
            in_flight = time.time() - log.stat().st_mtime  # time spent on the current task so far
            left = max(0, (N - done) * (avg or 150) - min(in_flight, avg or 150))
            status = f"~{left / 60:.0f} min left"
            queued_eta = left
        cur = next((t for t in TASKS if t not in {x["task"] for x in r}), None)
        lines.append(f"{name:22s} {bar(done)} {done:2d}/{N}  merged {merged}/{done or 0}  {status}")
        if cur and started and done < N:
            lines.append(f"{'':22s} now running: {cur} ({TASKS[cur]['level']})")
    return "\n".join(lines)


ap = argparse.ArgumentParser()
ap.add_argument("--watch", action="store_true")
a = ap.parse_args()
if not a.watch:
    print(snapshot())
else:
    try:
        while True:
            os.system("cls" if os.name == "nt" else "clear")
            print(time.strftime("%H:%M:%S"), "· Pennywise benchmark\n")
            print(snapshot())
            time.sleep(10)
    except KeyboardInterrupt:
        pass
