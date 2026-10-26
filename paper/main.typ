// Technical Report v0.1. Every result number comes from generated/*.typ (paper/gen_tables.py).
#import "generated/numbers.typ": *

#let commit = sys.inputs.at("commit", default: "unknown")
#let built = sys.inputs.at("date", default: "unknown")

#set document(title: "Learning to Route LLM Calls with an Open Decision Model", author: "Pennywise contributors")
#set page(
  paper: "a4", margin: (x: 2.3cm, y: 2.2cm), numbering: "1",
  background: if synthetic { rotate(-35deg, text(64pt, fill: red.transparentize(80%), weight: "bold")[SYNTHETIC — NOT RESULTS]) }
    else if draft { rotate(-35deg, text(44pt, fill: orange.transparentize(80%), weight: "bold")[DRAFT · PARTIAL RESULTS]) },
)
#set text(font: ("New Computer Modern", "Libertinus Serif"), size: 10.5pt)
#set par(justify: true, leading: 0.62em)
#set heading(numbering: "1.")
#show heading.where(level: 1): set block(above: 1.4em, below: 0.8em)
#show link: set text(fill: rgb("#1d4ed8"))

#align(center)[
  #text(9pt, fill: rgb("#b91c1c"), weight: "bold")[TECHNICAL REPORT v0.1 — PRELIMINARY, NOT PEER-REVIEWED] \
  #v(0.6em)
  #text(17pt, weight: "bold")[Pennywise: Learning to Route LLM Calls with an Open Decision Model \ #text(14pt)[Policy-Gradient Training of Laya as a Cost-Aware Router]]
  #v(0.5em)
  Pennywise contributors \
  #text(9pt)[Built #built from commit #raw(commit) · seed #seed]
]
#if draft [
  #v(0.4em)
  #block(fill: orange.lighten(85%), inset: 8pt, radius: 3pt, width: 100%)[
    #text(9pt)[*Interim draft.* Built from real outcomes while RL training is still running. Only the RL policies for $lambda in {#draft_lams}$ had finished, so the mode selection, the RL rows and the Pareto curve cover those values only. Every number will change when the remaining runs finish. The policy-map figure is omitted until the visualisation export runs.]
  ]
]

#v(0.8em)
#block(inset: (x: 1.2cm))[
  *Abstract.* Agents send every request to a frontier model, including the many bounded ones a far cheaper model would answer correctly. We treat model-tier selection as a contextual bandit and use an open-weight non-autoregressive decision model, Laya @laya2026card, as the policy: its option distribution over {small, medium, large} _is_ $pi(a|s)$, available from a single forward pass. Starting from a supervised warm start on hindsight-optimal labels, we train one policy per cost weight $lambda$ with REINFORCE on reward $r = "correct"(a) - lambda dot "cost"(a)\/"cost"_"ref"$, using only the sampled arm's outcome. On a held-out test set of #n_test benchmark and agent-style prompts, the policy selected on validation for the default `auto` mode ($lambda$ = #lam_auto) reaches #auto_acc% accuracy (95% CI #auto_acc_lo–#auto_acc_hi) at #auto_cost% of the cost of always calling the largest model (CI #auto_cost_lo–#auto_cost_hi), versus #large_acc% for always-large. These are offline results on a small test set with one seed; we report confidence intervals throughout and compare against strong cheap baselines.
]

= Introduction

Coding agents and LLM applications route nearly every call, from classification and summaries to multi-step reasoning, to one expensive model. Teams that measure AI spend in _dollars per merged pull request_ pay frontier prices for requests a small open model would get right. LLM routing addresses this by choosing a model per request @ong2024routellm @chen2023frugalgpt @aggarwal2023automix.

A recent class of _decision models_ returns typed answers with probabilities instead of generating text: the closed Jev @lds2026jev and the open-weight Laya @laya2026card. We observe that such a model's output over a small, typed option set is exactly a stochastic policy, so it can be trained directly with policy gradients without token-level RL.

*Contributions* (scoped to what we measured):
+ A router that uses Laya's option distribution as the policy $pi(a|s)$ over three model tiers, trained with a supervised warm start followed by REINFORCE on a correctness-minus-cost reward, yielding a family of policies indexed by $lambda$.
+ An evaluation on #n_prompts automatically graded prompts (math, science QA, code, and an agent-style slice of bug-fix and CI-triage tasks built by bug injection), with bootstrap confidence intervals and cheap embedding baselines, including per-tier correctness predictors swept over the same $lambda$ grid.
+ An open implementation: an OpenAI-compatible proxy with sticky per-session routing and tool-call passthrough, so agent CLIs can use the router by changing one base URL.

= Related Work

*LLM routing and cascades.* RouteLLM trains routers from preference data to choose between a strong and a weak model @ong2024routellm. FrugalGPT learns cascades over multiple LLMs to reduce cost @chen2023frugalgpt. AutoMix combines small-model self-verification with a POMDP-based router that decides when to escalate @aggarwal2023automix. RouterBench provides a benchmark and a large dataset of inference outcomes for evaluating routers @hu2024routerbench; we have not evaluated on it yet.

*Decision models.* Jev is a closed decision model returning typed choices, scores and yes/no answers with probabilities @lds2026jev. Laya is an open-weight model of the same category: a ModernBERT-large encoder @warner2024modernbert with a decision head that scores each option at its own marker in one pass @laya2026card. REFLEX uses Jev as a fast typed decision layer inside an agent and escalates to a strong LLM when confidence is low @wu2026reflex. Our work differs in _training_ the decision model as a routing policy with RL on observed outcomes, using open weights end to end.

= Method

== Decision-model output as a policy
Laya encodes `[CLS] choice question: <instructions> [SEP] [MASK] opt₀ [MASK] opt₁ [MASK] opt₂ [SEP] <request> [SEP]` and reads one logit per option at its `[MASK]` position @laya2026card. With three options (`small`, `medium` and `large`, each given a short description) the softmax over these logits defines $pi_theta(a|s)$ for state $s$ = the request text. One forward pass yields the full distribution, so $log pi_theta(a|s)$ is available for every action at the cost of a single encoder call.

== Reward
Each prompt was answered by all three tiers and graded automatically (Section 4). For action $a$, $r(s, a) = bb(1)["correct"(s,a)] - lambda dot c(s,a) \/ c_"ref"$, where $c(s,a)$ is the measured USD cost of that call and $c_"ref"$ = #cost_ref USD is the mean cost of always-large on the training split, which makes $lambda$ unitless.

== Supervised warm start
We first fine-tune on the _oracle_ label (the cheapest tier that answered correctly, or `large` if none did) with cross-entropy over the three options, for up to #sft_epochs epochs with early stopping on validation loss. To fit a 4 GB GPU we train only the top #n_top encoder layers plus Laya's decision head. Because the lower layers are frozen, their outputs are computed once per prompt and cached, and training runs only the trainable layers (the result is identical to the full forward up to bf16 rounding).

== REINFORCE with baseline and entropy
Starting from the warm start, for each $lambda in {#lambdas}$ we train a separate policy for #rl_steps steps with batches of #rl_batch training prompts. For each prompt we sample $a tilde pi_theta(dot|s)$, look up only that arm's reward, and minimise
$ cal(L) = -(r - b) log pi_theta(a|s) - beta H(pi_theta(dot|s)) $
with $b$ an exponential running mean of the batch reward @williams1992reinforce and $beta$ annealed linearly from #beta_start to #beta_end. Using only the sampled arm simulates the online partial-feedback setting, even though the offline table contains all three outcomes. The checkpoint with the highest validation reward is kept; the test split is never used for selection. The three proxy modes (`auto`, `auto-quality`, `auto-cheap`) map to trained $lambda$ values through fixed rules applied to validation results.

= Experimental Setup

*Data.* #n_prompts prompts with automatically checkable answers, mixing easy and hard sources because a pilot showed current open models saturate the easy ones: GSM8K @cobbe2021gsm8k (final number, exact match), MATH-500 levels 4–5 (the 500-problem subset @lightman2023verify of MATH @hendrycks2021math) (last `\boxed{}` answer after LaTeX normalisation), ARC-Challenge @clark2018arc and MMLU-Pro @wang2024mmlupro (option letter), MBPP @austin2021mbpp (unit tests in a sandboxed subprocess, 5 s timeout), and an agent-style slice built from disjoint, longer MBPP functions: _bug-fix_ prompts (one or two injected bugs among off-by-one, wrong operator, inverted condition and wrong return; graded by the original tests) and _CI-triage_ prompts (classify the injected bug type from the code and real test output; graded against the label known from construction). Splits are stratified by source, #n_train / #n_val / #n_test (train / val / test).

*Model tiers.* All three tiers are open-weight models with tool calling, served through OpenAI-compatible endpoints. Prices are per million tokens (input / output, USD):
#table(columns: 4, stroke: none, align: (left, left, right, right), table.hline(),
  [*Tier*], [*Model*], [*In*], [*Out*], table.hline(stroke: 0.5pt),
  ..tier_rows.map(r => r.map(x => [#x])).flatten(), table.hline())
All calls ran on NVIDIA's free API (actual spend \$0), so every cost is computed at the public list price of the same model on a paid provider (OpenRouter). The small tier has no paid listing; its price is a _proxy price_, the list price of `google/gemma-3-4b-it`, a model of the same \~4B size class.

*Baselines.* Always-small/medium/large; uniform random; the oracle (hindsight, not achievable); zero-shot Laya; logistic regression and $k$-NN predicting the oracle tier from frozen embeddings (base Laya, mean-pooled; and all-MiniLM-L6-v2 @minilm2021card), with $C$ and $k$ tuned on validation; and per-tier correctness predictors, one logistic regression per tier estimating $P("correct"|s, a)$, acting by $arg max_a P("correct"|s,a) - lambda dot overline(c)_a \/ c_"ref"$ over the same $lambda$ grid. Jev: #jev_status.

*Metrics.* Test accuracy, mean cost per request, cost relative to always-large, and router latency, each with 95% percentile bootstrap intervals (#n_boot resamples). Comparisons against always-large use paired bootstrap differences.

*Training.* SFT learning rate #sft_lr; RL learning rate #rl_lr, AdamW, gradient clipping 1.0, bf16 autocast, seed #seed. Hardware: a single 4 GB laptop GPU (RTX 3050).

= Results

#figure(
  text(8.5pt, include "generated/results_table.typ"),
  caption: [Test-set results (n = #n_test). Per-tier LR rows are shown for a subset of $lambda$. Router latency is the median single-request time on the build machine's GPU.],
) <tab:main>

#figure(image("figures/pareto.pdf", width: 88%), caption: [Accuracy vs. cost relative to always-large. Shaded band: 95% CI of the RL family.]) <fig:pareto>

The validation-selected `auto` policy ($lambda$ = #lam_auto) differs from always-large in accuracy by #auto_vs_large points (paired 95% CI #auto_vs_large_lo to #auto_vs_large_hi) while costing #auto_cost% as much. Zero-shot Laya reaches #zs_acc% at #zs_cost% cost. The supervised warm start raises validation agreement with the oracle label from #sft_zs_val% (zero-shot) to #sft_best_val% (epoch #sft_best_epoch). @tab:main and @fig:pareto place the RL family against the per-tier correctness predictors, the strongest cheap baseline. Where those match or beat the RL policies, Pennywise's remaining advantages are architectural (a single model scoring options directly, trainable from bandit feedback) rather than accuracy.

#figure(image("figures/reward_curves.pdf", width: 88%), caption: [Training reward (sampled actions, 25-step moving average) per $lambda$.]) <fig:curves>

#if not draft [#figure(
  grid(columns: 3, gutter: 4pt, image("figures/brainmap_early.png"), image("figures/brainmap_mid.png"), image("figures/brainmap_final.png")),
  caption: [UMAP @mcinnes2018umap of base-model prompt embeddings, coloured by the `auto` policy's chosen tier (teal = small, indigo = medium, pink = large; size = confidence) at the start, middle and end of RL.],
) <fig:brain>]

#figure(text(8.5pt, include "generated/source_table.typ"), caption: [Per-source accuracy % / cost % of always-large on the test split. The agent-style slices are reported separately.]) <tab:src>

*Router latency.* The router adds one encoder pass: #router_ms ms median on the build machine's GPU for `auto`. CPU latency on the deployment host is reported in the repository.

= Limitations and Future Work

The test set is small (n = #n_test), so intervals are wide. We use a single seed. The setting is offline: although RL uses only the sampled arm, the outcome table was collected with full information, which an online system would not have. Benchmark prompts are not production traffic, and the agent slice consists of synthetic single-function tasks. Laya is known to degrade with many options @laya2026card, which is irrelevant at three tiers but limits extension to many models. Jev was not benchmarked.

Planned work: partial-feedback online RL with a feedback endpoint; comparison with an exact expected-reward objective (possible offline because all outcomes are known); evaluation on RouterBench @hu2024routerbench; out-of-distribution tests; more tiers; multiple seeds; calibration analysis.

= Reproducibility

Code, configs and this report's sources are at the project repository, commit #raw(commit). `config/models.yaml` (tiers, prices) and `config/train.yaml` (splits, hyperparameters, $lambda$ grid, seed) define the run. Commands: `python data/build_prompts.py`, `python data/run_models.py`, `python -m eval.features`, `python -m eval.baselines`, `python -m router.sft`, `python -m router.rl`, `python -m eval.evaluate`, `python -m eval.export_viz`, `python paper/build.py`.

#bibliography("refs.bib", style: "ieee")
