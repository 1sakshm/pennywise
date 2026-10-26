"""Fill {{placeholders}} in launch/*.md from eval outputs -> launch/*.filled.md (originals untouched).
Unknown placeholders are left visible so nothing unmeasured slips through.
    python scripts/fill_launch.py --site https://... --repo https://github.com/...
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def values(site, repo):
    allr = json.load(open(ROOT / "eval" / "results" / "all.json"))
    if allr.get("synthetic"):
        raise SystemExit("refusing to fill launch copy from SYNTHETIC results")
    man = json.load(open(ROOT / "web" / "public" / "data" / "manifest.json"))
    h = man["headline"]
    v = {"lam_auto": f"{h['lambda']:g}", "auto_acc": f"{100 * h['accuracy']:.1f}", "auto_cost": f"{100 * h['cost_vs_large']:.0f}",
         "n_test": str(man["n_test"]), "n_prompts": str(man["n_prompts"]), "site_url": site, "repo_url": repo}
    ab = ROOT / "eval" / "results" / "alan_before_after.json"
    if ab.exists():
        a = json.load(open(ab))
        v.update({"alan_n": str(a["n_tasks"]), "alan_before": f"${a['usd_per_merged_pr']['before']:.3f}",
                  "alan_after": f"${a['usd_per_merged_pr']['after']:.3f}"})
    return v


def main(a):
    v = values(a.site, a.repo)
    for f in (ROOT / "launch").glob("*.md"):
        if f.name.endswith(".filled.md"):
            continue
        txt = re.sub(r"\{\{(\w+)\}\}", lambda m: v.get(m.group(1), m.group(0)), f.read_text(encoding="utf-8"))
        out = f.with_suffix(".filled.md")
        out.write_text(txt, encoding="utf-8")
        left = sorted(set(re.findall(r"\{\{(\w+)\}\}", txt)))
        print(f"{out.relative_to(ROOT)}" + (f"  (unfilled: {left})" if left else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="{{site_url}}")
    ap.add_argument("--repo", default="{{repo_url}}")
    main(ap.parse_args())
