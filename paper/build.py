"""Build the technical report: regenerate tables/figures from eval outputs, then compile Typst.
Injects the git commit hash and build date. Output: paper/paper.pdf (+ copy to web/public/paper.pdf).
    python paper/build.py            # SYNTHETIC=1 builds a watermarked throwaway copy under data/cache/
"""
import datetime
import shutil
import subprocess
import sys
from pathlib import Path

import typst

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from paper import gen_tables  # noqa: E402
from router.paths import SYNTHETIC  # noqa: E402

gen_tables.main()
try:
    commit = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = subprocess.run(["git", "diff", "--quiet"], cwd=ROOT).returncode != 0
except Exception:
    commit, dirty = "unknown", False
out_dir = gen_tables.OUT
pdf = out_dir / "paper.pdf"
typst.compile(str(out_dir / "main.typ"), output=str(pdf), root=str(out_dir),
              sys_inputs={"commit": commit + ("-dirty" if dirty else ""), "date": datetime.date.today().isoformat()})
print(f"compiled {pdf.relative_to(ROOT)} @ {commit}{'-dirty' if dirty else ''}")
if not SYNTHETIC:
    shutil.copy(pdf, ROOT / "web" / "public" / "paper.pdf")
    print("copied to web/public/paper.pdf")
