# Citation verification log

Hard rule: a reference is cited only if its page was actually opened in the build session. Every `refs.bib` key is listed here with the URL that was opened and the single claim it supports. **Every entry still needs manual verification before publishing.**

Verified on 2026-10-26.

| key | title · authors · year | URL opened | cited for |
|---|---|---|---|
| `ong2024routellm` | RouteLLM: Learning to Route LLMs with Preference Data · Ong, Almahairi, Wu, Chiang, Wu, Gonzalez, Kadous, Stoica · 2024 | https://arxiv.org/abs/2406.18665 | Routers trained on human preference data, routing between a stronger and a weaker LLM to trade cost against quality. |
| `chen2023frugalgpt` | FrugalGPT · Chen, Zaharia, Zou · 2023 | https://arxiv.org/abs/2305.05176 | LLM cascade that learns which models to query per input to cut cost. (The abstract page doesn't describe the scoring function, so we don't characterise it.) |
| `hu2024routerbench` | RouterBench · Hu, Bieker, Li, Jiang, Keigwin, Ranganath, Keutzer, Upadhyay · 2024 | https://arxiv.org/abs/2403.12031 | Benchmark + dataset (405k+ inference outcomes) for multi-LLM routing. We name it as future evaluation only. |
| `aggarwal2023automix` | AutoMix · Aggarwal et al. (13 authors) · 2023 | https://arxiv.org/abs/2310.12963 | Small-model self-verification plus a POMDP-based router that decides when to escalate to a larger model. |
| `wu2026reflex` | REFLEX with Jev for Efficient Selective Control in LLM Agents · Wu, Lim · 2026 | https://arxiv.org/abs/2609.26532 | Uses Jev as a typed decision layer and escalates to a strong LLM when confidence is low; reports 95% success with 72.7% fewer strong-model calls on a frozen 100-task benchmark (the authors' own result). |
| `laya2026card` | Laya model card · Convai Innovations · 2026 | https://huggingface.co/convaiinnovations/laya | Architecture (ModernBERT-large encoder + decision head, 421M), option-marker scoring, Apache-2.0, weak zero-shot / fine-tuning recommended, act-head caveat (#185). |
| `lds2026jev` | TypeSafe AI Launches Jev for Structured Software Decisions · LDS Team · 2026 | https://letsdatascience.com/news/typesafe-ai-launches-jev-decision-model-889a38c0 | Jev is a closed early-access decision model (launched Sept 15, 2026) that returns typed choices/scores/yes-no with probabilities. |
| `warner2024modernbert` | Smarter, Better, Faster, Longer (ModernBERT) · Warner et al. (14 authors) · 2024 | https://arxiv.org/abs/2412.13663 | ModernBERT is a modernised encoder-only transformer (Laya's backbone). |
| `williams1992reinforce` | Simple statistical gradient-following algorithms for connectionist reinforcement learning · Williams · 1992 · Machine Learning 8(3-4):229–256 | https://api.crossref.org/works/10.1007/BF00992696 (bibliographic record) | REINFORCE. ⚠️ **Only the Crossref metadata was opened**: Springer redirected to a login page. Please confirm against the paper. |
| `cobbe2021gsm8k` | Training Verifiers to Solve Math Word Problems · Cobbe et al. (12 authors) · 2021 | https://arxiv.org/abs/2110.14168 | GSM8K dataset. |
| `austin2021mbpp` | Program Synthesis with Large Language Models · Austin et al. (11 authors) · 2021 | https://arxiv.org/abs/2108.07732 | MBPP dataset (974 entry-level programming tasks with tests). |
| `clark2018arc` | Think you have Solved Question Answering? Try ARC · Clark et al. (7 authors) · 2018 | https://arxiv.org/abs/1803.05457 | ARC-Challenge set. |
| `mcinnes2018umap` | UMAP · McInnes, Healy, Melville · 2018 | https://arxiv.org/abs/1802.03426 | UMAP projection used for the galaxy / brain-map figures. |
| `minilm2021card` | all-MiniLM-L6-v2 model card · sentence-transformers | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 | The off-the-shelf 384-d sentence-embedding baseline. (The card asks for no specific paper citation.) |
| `hendrycks2021math` | Measuring Mathematical Problem Solving With the MATH Dataset · Hendrycks, Burns, Kadavath, Arora, Basart, Tang, Song, Steinhardt · 2021 | https://arxiv.org/abs/2103.03874 | MATH dataset (12,500 competition problems). |
| `lightman2023verify` | Let's Verify Step by Step · Lightman et al. (10 authors) · 2023 | https://arxiv.org/abs/2305.20050 (+ dataset card https://huggingface.co/datasets/HuggingFaceH4/MATH-500) | Origin of the MATH-500 subset (per the HF dataset card, which says the 500 problems come from this paper's prm800k release). |
| `wang2024mmlupro` | MMLU-Pro · Wang et al. (17 authors) · 2024 | https://arxiv.org/abs/2406.01574 | MMLU-Pro: harder, reasoning-focused MMLU extension with ten answer options. |

## Placeholders still open
- None.
