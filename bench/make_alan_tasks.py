"""Create the Alan arm's task folders: one git repo per task under D:/AlanBench (or --out), each with
the task files and TASK.md (the exact prompt to paste into Alan Code with Auto Router).
    python bench/make_alan_tasks.py [--out D:/AlanBench]
Then follow bench/ALAN_RUNBOOK.md and score with:  python bench/score.py --alan D:/AlanBench
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tasks import TASKS  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="D:/AlanBench")
a = ap.parse_args()
root = Path(a.out)
root.mkdir(parents=True, exist_ok=True)
rows = ["task,level,routed_model,minutes,notes"]
for i, (name, t) in enumerate(TASKS.items(), 1):
    d = root / f"{i:02d}_{name}"
    if d.exists():
        print("exists, skipped:", d)
        continue
    d.mkdir()
    for fn, src in t["files"].items():
        (d / fn).write_text(src, encoding="utf-8")
    (d / "TASK.md").write_text(t["ask"] + "\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=d, check=True)
    subprocess.run(["git", "add", "-A"], cwd=d, check=True)
    subprocess.run(["git", "-c", "user.name=bench", "-c", "user.email=bench@local", "commit", "-qm", "task start"], cwd=d, check=True)
    rows.append(f"{name},{t['level']},,,")
    print("created", d)
sheet = root / "alan_results.csv"
if not sheet.exists():
    sheet.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print("fill in:", sheet)
