"""Interim report from whatever has finished: copies the real eval/results/* into
data/cache/draft/results/, runs eval.evaluate there (CPU only), then builds a watermarked PDF at
data/cache/draft/paper/paper.pdf. Never writes eval/results, paper/generated or web/public.
    python paper/draft.py
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dst = ROOT / "data" / "cache" / "draft" / "results"
dst.mkdir(parents=True, exist_ok=True)
for f in dst.glob("*.json"):
    f.unlink()
for f in (ROOT / "eval" / "results").glob("*.json"):
    if f.name not in ("all.json",):
        shutil.copy(f, dst / f.name)
env = dict(os.environ, DRAFT="1")
subprocess.run([sys.executable, "-m", "eval.evaluate"], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)
subprocess.run([sys.executable, str(ROOT / "paper" / "build.py")], cwd=ROOT, env=env, check=True)
