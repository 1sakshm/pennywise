# Decisions log

Running log of what was tried, what changed, and why. Newest at the bottom.

## 2026-10-26

- **Hardware is a 4 GB RTX 3050 laptop GPU, not 8 GB.** The brief sized SFT for 8 GB. Plan: freeze most of the encoder, train the top few ModernBERT layers + Laya's decision head in bf16 with micro-batch + grad accumulation. LoRA stays available as a fallback if that still OOMs.
- **Laya param count is 421M total** (ModernBERT-large ~395M encoder + decision head trained from scratch), per the official model card. The brief's "~395M" refers to the encoder only.
- **venv built from Anaconda Python 3.13** (`D:Anacondapython.exe`): the `python` on PATH is MSYS2's (POSIX-layout venvs, no CUDA torch wheels), and the `py` launcher points at a removed 3.11. torch 2.6.0+cu124.
- **Base checkpoint = root `convaiinnovations/laya`** (English, 512 ctx). `laya-typed-decisions` has 1024 ctx but is already specialised to four unrelated workflows; starting from the base keeps the RL story clean.
- **Laya used through its own `load_checkpoint` / `build_sequence` / `collate_items`**, not re-implemented. Our argmax matched `laya.Agent.predict` on 5/5 sample prompts, so the encoding is verified.
- **Triage slice classifies the injected bug type, not the exception type**, because the exception type is printed in the traceback and would make the task trivial. Tracebacks are sanitised to `prog.py` so local temp paths don't leak into the dataset.
- **Grader sandbox on Windows**: `python -I` in a temp dir, a 5 s timeout, a minimal env, and `socket` monkeypatched to raise. There's no OS-level network isolation, which is acceptable because the code under test comes from MBPP and from our own tier models. Sanity check: MBPP references pass 20/20 and injected bugs pass 0/20.
