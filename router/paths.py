"""Single place for data/result paths.

SYNTHETIC=1 redirects every input/output to data/cache/synthetic/ (gitignored) so the
pipeline can be developed before real model outcomes exist. Real results never mix with it.
DRAFT=1 (paper/draft.py) reads real outcomes but writes results to data/cache/draft/ so an
interim report can be built from whatever RL runs have finished, without touching eval/results.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC = os.environ.get("SYNTHETIC") == "1"

PROMPTS = ROOT / "data" / "processed" / "prompts.jsonl"
FEATURES = ROOT / "data" / "cache" / "features.npz"
_base = ROOT / "data" / "cache" / "synthetic" if SYNTHETIC else None
DRAFT = os.environ.get("DRAFT") == "1" and not SYNTHETIC

OUTCOMES = _base / "outcomes.jsonl" if SYNTHETIC else ROOT / "data" / "processed" / "outcomes.jsonl"
RESULTS = _base / "results" if SYNTHETIC else ROOT / "data" / "cache" / "draft" / "results" if DRAFT else ROOT / "eval" / "results"
CKPTS = _base / "checkpoints" if SYNTHETIC else ROOT / "router" / "checkpoints"
SNAPSHOTS = _base / "snapshots" if SYNTHETIC else ROOT / "router" / "snapshots"
VIZ = ROOT / "web" / "public" / ("data-synthetic" if SYNTHETIC else "data")

for _p in (RESULTS, CKPTS, SNAPSHOTS, VIZ):
    _p.mkdir(parents=True, exist_ok=True)
