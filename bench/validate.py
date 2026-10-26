"""Check every benchmark task: the starting code must FAIL its tests and the reference solution must PASS.
    python bench/validate.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reference import REFERENCE  # noqa: E402
from tasks import TASKS  # noqa: E402


def run(files):
    with tempfile.TemporaryDirectory() as d:
        for name, src in files.items():
            Path(d, name).write_text(src, encoding="utf-8")
        return subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=d, capture_output=True, text=True).returncode == 0


ok = True
for name, t in TASKS.items():
    start = run(t["files"])
    ref = run({**t["files"], **REFERENCE[name]})
    good = (not start) and ref
    ok &= good
    print(f"{name:16s} {t['level']:6s} start={'pass' if start else 'fail'}  reference={'pass' if ref else 'FAIL'}  {'ok' if good else 'BROKEN'}")
sys.exit(0 if ok else 1)
