# Laya notes

Verified on 2026-10-26 from the official sources, plus reading the installed `laya` package source (pip `laya`, installed into `.venv`):
- Model card: https://huggingface.co/convaiinnovations/laya
- Code: https://github.com/NandhaKishorM/laya
- Package source read: `laya/common.py` (`build_head`, `build_sequence`, `DecisionModel`, `collate_items`), `laya/train.py` (`load_checkpoint`, `save_checkpoint`, losses), `laya/agent.py` (`Agent`, `_to_internal`, temperature).

## License
Apache-2.0 (weights and code).

## Checkpoints
| id | encoder | params | max_len | head_max_len |
|---|---|---|---|---|
| `convaiinnovations/laya` (root) | ModernBERT-large | 421M total | 512 | 192 |
| `convaiinnovations/laya` subfolder `multilingual` | mmBERT-base | 322M | 1024 (to 8192) | 256 |
| `convaiinnovations/laya` subfolder `typed-decisions` | ModernBERT-large | 421M | 1024 | 256 |

**We use the root English checkpoint** as the base for fine-tuning. The brief's "~395M" is the ModernBERT-large encoder. The decision head (2 transformer layers + scorer + act head) is trained from scratch on top, giving 421M in total.

## Input format (from `common.build_head` / `build_sequence`)
```
[CLS] <type> question: <instructions> [SEP] [MASK] opt0 [MASK] opt1 ... [SEP] <state> [SEP]
```
- `choice` options render as `"key: description"` (or just `key` if there's no description). Each option is capped at 48 tokens, and all options share `head_max_len`.
- The state is a string, or JSON-serialised if it's a dict/list. It's truncated from the **right** to whatever room the head leaves in `max_len`.
- Internal question dict: `{"t": "choice"|"score"|"noul", "ins": str, "crit": {...}}`. Public API: `{"type", "instructions", "criteria"}`.

## How options are scored
`DecisionModel.forward` runs the encoder, adds a type embedding, runs 2 head transformer layers, gathers the hidden state at each option's `[MASK]` position, and applies an MLP scorer. That gives one logit per option, and a softmax over options gives the distribution. **One forward pass gives the whole action distribution.** At inference `Agent` divides the logits by a fitted per-(type, option-count) temperature. Training uses raw logits.

## Act/escalate head
`act_head` takes the pooled `[CLS]` state plus confidence features. **Per the card, `act_probability` carries no usable signal (issue #185, AUROC 0.30); gate on `confidence` instead.** We don't use it.

## How we load it
`laya.train.load_checkpoint(model_dir)` returns `(DecisionModel, tokenizer, cfg)` in fp32 on CPU. `laya.train.save_checkpoint` writes the layout `laya.load` reads (fp16 safetensors + encoder config + tokenizer + `rl_agent_config.json`). `router/laya_model.py` wraps these and calls `build_sequence`/`collate_items` directly, so our inputs are byte-identical to Laya's. **Check:** argmax agreed with `laya.load(...).predict()` on 5/5 sample prompts. Its probabilities are softer than ours because of its temperature.

## Fine-tuning (official)
`laya.train.finetune(train.jsonl, ..., TrainConfig(...))`, run from Kaggle 2×T4 or MPS notebooks. The objective is "RLCD": soft cross-entropy against a target distribution plus a Gaussian-noise policy-gradient term with proper-scoring-rule rewards (`train.rlcd_loss`). **We don't use `finetune()`.** Our SFT is plain cross-entropy over the 3 options, and our RL is REINFORCE on sampled discrete actions with an environment reward. Both are custom loops over the same `DecisionModel`, because the brief needs per-step snapshots and an outcome-table reward that `finetune()` doesn't expose.

## Limitations relevant to us
- Near-chance zero-shot on new decision types. The card says to fine-tune.
- Ships overconfident. Calibration is a temperature refit.
- Degrades with ~20+ options. We use 3.
- 512-token context on the root checkpoint, so long prompts (e.g. triage with tracebacks) are truncated on the right.

## Unclear / conservative choices
- The card doesn't say whether the decision head was trained with frozen or unfrozen encoders. We unfreeze only the top encoder layers (4 GB VRAM constraint; see DECISIONS.md).
- Embedding for baselines: we mean-pool the encoder's last hidden state over the raw prompt, with no question head. That's the same idea as the package's `embed_fn_from_agent` ("mean-pools the encoder").
