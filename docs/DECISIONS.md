# Decisions log

Running log of what was tried, what changed, and why. Newest at the bottom.

## 2026-10-26

- **Hardware is a 4 GB RTX 3050 laptop GPU, not 8 GB.** The brief sized SFT for 8 GB. Plan: freeze most of the encoder, train the top few ModernBERT layers + Laya's decision head in bf16 with micro-batch + grad accumulation. LoRA stays available as a fallback if that still OOMs.
- **Laya param count is 421M total** (ModernBERT-large ~395M encoder + decision head trained from scratch), per the official model card. The brief's "~395M" refers to the encoder only.
- **Python 3.11 venv**, not the system 3.12: the `python` on PATH is MSYS2's, whose venvs don't get CUDA torch wheels.
