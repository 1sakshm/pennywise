// Technical Report v0.1. Every number comes from generated/*.typ (paper/gen_tables.py + paper/gen_extra.py).
// Never type a result number into this file.
#import "generated/numbers.typ": *
#import "generated/extra.typ": *
#import "diagrams.typ": system-diagram, training-diagram

#let commit = sys.inputs.at("commit", default: "unknown")
#let built = sys.inputs.at("date", default: "unknown")
#let gold = rgb("#a16207")
#let ink = rgb("#111827")
#let muted = rgb("#4b5563")

#set document(title: "Pennywise: Learning to Route LLM Calls with an Open Decision Model", author: "Pennywise contributors")
#set page(
  paper: "a4", margin: (x: 1.75cm, top: 2.1cm, bottom: 2.0cm), columns: 2,
  header: context {
    if counter(page).get().first() > 1 [
      #set text(7.5pt, fill: muted)
      #smallcaps[Pennywise] — RL-trained routing with an open decision model #h(1fr) Technical report v0.1 · preliminary
      #v(-0.55em) #line(length: 100%, stroke: 0.4pt + luma(200))
    ]
  },
  footer: context [
    #set text(7.5pt, fill: muted)
    #raw(commit) · #built #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
  background: if synthetic { rotate(-35deg, text(64pt, fill: red.transparentize(80%), weight: "bold")[SYNTHETIC — NOT RESULTS]) }
    else if draft { rotate(-35deg, text(44pt, fill: orange.transparentize(80%), weight: "bold")[DRAFT · PARTIAL RESULTS]) },
)
#set columns(gutter: 0.62cm)
#set text(font: ("New Computer Modern", "Libertinus Serif"), size: 9.4pt, fill: ink)
#set par(justify: true, leading: 0.56em, spacing: 0.75em, first-line-indent: (amount: 1em, all: false))
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => block(above: 1.25em, below: 0.65em, text(10.5pt, weight: "bold", it))
#show heading.where(level: 2): it => block(above: 1.0em, below: 0.5em, text(9.4pt, weight: "bold", it))
#show heading.where(level: 3): it => [#text(weight: "bold", it.body). ]
#set math.equation(numbering: "(1)")
#show link: set text(fill: rgb("#1d4ed8"))
#show figure.caption: it => {
  set text(8.2pt)
  set par(justify: true, first-line-indent: 0em)
  [#text(weight: "bold")[#it.supplement #context it.counter.display(it.numbering).] #it.body]
}
#show figure.where(kind: table): set figure.caption(position: top)
#set figure(gap: 0.6em, placement: auto)
#show figure: set block(breakable: false)
#set table(stroke: none)
#show table: set text(7.6pt)
#show raw: set text(font: ("DejaVu Sans Mono", "Consolas"), size: 0.9em)
#let wide(body, cap) = figure(placement: top, scope: "parent", body, caption: cap)
#let note(body) = block(fill: luma(246), stroke: (left: 1.5pt + gold), inset: (x: 7pt, y: 6pt), width: 100%, text(8.4pt, body))

// ------------------------------------------------------------------ title block
#place(top + center, scope: "parent", float: true, clearance: 1.4em)[
  #set par(first-line-indent: 0em, justify: false)
  #text(7.5pt, fill: rgb("#b91c1c"), tracking: 0.08em, weight: "bold")[TECHNICAL REPORT v0.1 · PRELIMINARY · NOT PEER-REVIEWED]
  #v(0.7em)
  #text(17pt, weight: "bold")[Pennywise: Learning to Route LLM Calls \ with an Open Decision Model]
  #v(0.35em)
  #text(11pt, fill: muted)[Policy-gradient training of Laya as a cost-aware router]
  #v(0.7em)
  #text(9.5pt)[Pennywise contributors] \
  #text(8pt, fill: muted)[Built #built from commit #raw(commit) · seed #seed · all numbers generated from evaluation outputs]
  #v(0.9em)
  #block(width: 88%, inset: (x: 0pt))[
    #set par(justify: true)
    #set text(8.8pt)
    #align(left)[
      #text(weight: "bold")[Abstract.] Agents send every request to a frontier model, including the many bounded ones a far cheaper model would answer correctly. We treat model-tier selection as a contextual bandit and use an open-weight, non-autoregressive decision model, Laya @laya2026card, as the policy: its distribution over {small, medium, large} _is_ $pi(a|s)$, available from one forward pass. After a supervised warm start on hindsight-optimal labels, we train one policy per cost weight $lambda$ with REINFORCE on $r = "correct"(a) - lambda dot c(a) \/ c_"ref"$, observing only the sampled arm. We build an outcome table of #n_prompts automatically graded prompts answered by three open-weight tiers (#n_calls calls; tier accuracies #acc_small / #acc_medium / #acc_large%, any-tier ceiling #acc_oracle_all%). On a held-out test set of #n_test prompts, the validation-selected `auto` policy ($lambda$ = #lam_auto) reaches *#auto_acc%* accuracy (95% CI #auto_acc_lo–#auto_acc_hi) at *#auto_cost%* of the cost of always calling the largest model (CI #auto_cost_lo–#auto_cost_hi), versus #large_acc% for always-large; the paired accuracy difference is #auto_vs_large points (CI #auto_vs_large_lo to #auto_vs_large_hi). The trained policies mostly learn to default to the medium tier, close to an always-medium baseline (difference #auto_vs_med points, CI #auto_vs_med_lo to #auto_vs_med_hi); we report confidence intervals throughout and compare against strong cheap baselines, including where they win.
    ]
  ]
  #if draft [
    #v(0.6em)
    #block(fill: orange.lighten(86%), inset: 7pt, radius: 2pt, width: 88%)[#set text(8pt); #align(left)[*Interim draft.* Built from real outcomes while RL training is still running: #n_rl_done of the $lambda$ policies ($lambda in {#rl_lams_done}$) had finished, so mode selection, RL rows and $lambda$-sweep figures cover those only. Every RL number will change.]]
  ]
]

// ------------------------------------------------------------------ 1
= Introduction

Coding agents and LLM applications route nearly every call, from classification and summaries to multi-step reasoning, to one expensive model. Teams that measure AI spend in _dollars per merged pull request_ pay frontier prices for requests a small open model would answer correctly. On our outcome table the largest tier costs on average #cost_ratio_large_small× more per call than the small tier and #cost_ratio_large_medium× more than the medium tier, yet the medium tier's accuracy (#acc_medium%) is within a point of the large tier's (#acc_large%). LLM routing addresses this gap by choosing a model per request @ong2024routellm @chen2023frugalgpt @aggarwal2023automix.

A recent class of _decision models_ returns typed answers with probabilities instead of generating text: the closed Jev @lds2026jev and the open-weight Laya @laya2026card. Such a model's output over a small, typed option set is exactly a stochastic policy, so it can be trained directly with policy gradients, without token-level RL.

#text(weight: "bold")[Contributions] (scoped to what we measured):
+ A router that uses Laya's option distribution as the policy $pi_theta (a|s)$ over three model tiers, trained with a supervised warm start followed by REINFORCE on a correctness-minus-cost reward, yielding a family of policies indexed by $lambda$ (@sec:method).
+ An outcome table of #n_prompts automatically graded prompts (math, science QA, code, and an agent-style slice of bug-fix and CI-triage tasks built by bug injection), each answered by all three tiers (@sec:data), with bootstrap confidence intervals and cheap embedding baselines, including per-tier correctness predictors swept over the same $lambda$ grid (@sec:results).
+ An open implementation: an OpenAI-compatible proxy with sticky per-session routing and tool-call passthrough, so agent CLIs can use the router by changing one base URL (@sec:system).

// ------------------------------------------------------------------ 2
= Related work

#text(weight: "bold")[Routing and cascades.] RouteLLM trains routers from preference data to choose between a strong and a weak model @ong2024routellm. FrugalGPT learns cascades over multiple LLMs to reduce cost @chen2023frugalgpt. AutoMix combines small-model self-verification with a POMDP-based router that decides when to escalate @aggarwal2023automix. RouterBench provides a benchmark and a large dataset of inference outcomes for evaluating routers @hu2024routerbench; we have not evaluated on it yet.

#text(weight: "bold")[Decision models.] Jev is a closed decision model returning typed choices, scores and yes/no answers with probabilities @lds2026jev. Laya is an open-weight model of the same category: a ModernBERT-large encoder @warner2024modernbert with a decision head that scores each option at its own marker in one pass @laya2026card. REFLEX uses Jev as a fast typed decision layer inside an agent and escalates to a strong LLM when confidence is low @wu2026reflex. We instead _train_ the decision model as a routing policy with RL on observed outcomes, using open weights end to end.

// ------------------------------------------------------------------ 3
= Problem formulation <sec:problem>

Let $s$ be a request and $cal(A) = {"small", "medium", "large"}$ the model tiers, ordered by price. Calling tier $a$ on $s$ yields a graded outcome $y(s,a) in {0,1}$ and a cost $c(s,a)$ in USD, computed from the call's measured token counts at the tier's public list price. A router is a policy $pi(a|s)$. For a cost weight $lambda >= 0$ we maximise the expected reward
$ J_lambda (pi) = EE_(s tilde cal(D)) EE_(a tilde pi(dot|s)) [ y(s,a) - lambda dot c(s,a) / c_"ref" ], $ <eq:objective>
where $c_"ref"$ = #cost_ref USD is the mean cost of always-large on the training split, which makes $lambda$ unitless: $lambda = 1$ trades one correct answer for the cost of one average large-tier call. The _oracle_ label $a^*(s)$ is the cheapest tier with $y(s,a) = 1$ (or `large` if none); it maximises @eq:objective for any $lambda > 0$ in hindsight but is not observable at decision time.

This is a contextual bandit: the router sees $s$, picks one arm, and in deployment observes only that arm's outcome. Our outcome table contains all three outcomes for every prompt, which allows exact offline evaluation; training nevertheless uses only the sampled arm, as an online system would.

// ------------------------------------------------------------------ 4
= Method <sec:method>

#wide(training-diagram(width: 100%), [Training pipeline. (a) Every prompt is answered by all three tiers and graded automatically. (b) Laya scores the three tier options at their `[MASK]` markers in one non-autoregressive pass; the bottom 24 encoder layers are frozen and their outputs cached, the top 4 layers and the decision head are trained. (c) A supervised warm start on oracle labels is followed by REINFORCE per $lambda$, using only the sampled arm's reward. (d) Checkpoints and proxy modes are selected on validation; the test split is used once.]) <fig:training>

== Decision-model output as a policy
Laya encodes `[CLS] choice question: <instructions> [SEP] [MASK] opt₀ [MASK] opt₁ [MASK] opt₂ [SEP] <request> [SEP]` and reads one logit $z_a$ per option at its `[MASK]` position @laya2026card. With the three tier options, each given a short description, the softmax
$ pi_theta (a|s) = exp(z_a (s)) \/ sum_(a') exp(z_(a') (s)) $
defines the policy. One forward pass yields the full distribution, so $log pi_theta (a|s)$ is available for every action at the cost of a single encoder call (@fig:training b).

== Supervised warm start
We first fine-tune on the oracle label with cross-entropy over the three options, for up to #sft_epochs epochs with early stopping on validation loss. To fit a 4 GB GPU we train only the top #n_top encoder layers plus the decision head. Because the lower layers are frozen, their outputs are computed once per prompt and cached; training then runs only the trainable layers, which is identical to the full forward pass up to bf16 rounding.

== REINFORCE with baseline and entropy
Starting from the warm start, for each $lambda in {#lambdas}$ we train a separate policy for #rl_steps steps with batches of #rl_batch training prompts, minimising
$ cal(L)(theta) = -(r - b) log pi_theta (a|s) - beta H(pi_theta (dot|s)), $ <eq:loss>
with $a tilde pi_theta (dot|s)$ sampled from the current policy, $r$ the sampled arm's reward from @eq:objective, $b$ an exponential running mean of the batch reward @williams1992reinforce, and $beta$ annealed linearly from #beta_start to #beta_end. The checkpoint with the highest validation reward is kept (Algorithm 1).

#figure(kind: "algorithm", supplement: [Algorithm], caption: [REINFORCE routing policy for one cost weight $lambda$.],
  block(width: 100%, stroke: (top: 0.6pt, bottom: 0.6pt), inset: (y: 5pt))[
    #set text(8.2pt)
    #set align(left)
    #set par(first-line-indent: 0em, leading: 0.5em)
    *Input:* warm-start $theta_0$, train/val prompts, outcome table $(y, c)$, $lambda$ \
    1: $b <- 0$, $theta <- theta_0$ \
    2: *for* $t = 1 dots T$ *do* \
    3: #h(1em) sample batch $\{s_i\}$; $a_i tilde pi_theta (dot|s_i)$ #h(1fr) _one forward pass_ \
    4: #h(1em) $r_i <- y(s_i, a_i) - lambda c(s_i, a_i) \/ c_"ref"$ #h(1fr) _sampled arm only_ \
    5: #h(1em) $theta <- theta - eta nabla_theta 1/n sum_i cal(L)_i$ (@eq:loss) #h(1fr) _top 4 layers + head_ \
    6: #h(1em) $b <- 0.95 b + 0.05 macron(r)$; anneal $beta$ \
    7: #h(1em) every few steps: keep $theta$ if val reward improves \
    8: *return* best $theta$
  ])

#text(weight: "bold")[Proxy modes.] Three modes map to trained $lambda$ values by fixed rules applied to validation results: `auto` is the cheapest RL policy whose accuracy is not significantly below always-large; `auto-quality` the most accurate; `auto-cheap` the cheapest at least as accurate as always-medium. Here `auto` = #lam_auto, `auto-quality` = #lam_quality, `auto-cheap` = #lam_cheap.

// ------------------------------------------------------------------ 5
= Data and setup <sec:data>

#text(weight: "bold")[Prompts.] #n_prompts prompts with automatically checkable answers, mixing easy and hard sources because a pilot showed current open models saturate the easy ones: GSM8K @cobbe2021gsm8k (final number, exact match), MATH-500 levels 4–5 (the subset @lightman2023verify of MATH @hendrycks2021math; last `\boxed{}` answer after LaTeX normalisation), ARC-Challenge @clark2018arc and MMLU-Pro @wang2024mmlupro (option letter), MBPP @austin2021mbpp (unit tests in a sandboxed subprocess, 5 s timeout), and an agent-style slice built from disjoint, longer MBPP functions: _bug-fix_ prompts (one or two injected bugs; graded by the original tests) and _CI-triage_ prompts (classify the injected bug type from the code and real test output). Splits are stratified by source, #n_train / #n_val / #n_test (train / val / test).

#wide(include "generated/dataset_table.typ", [Outcome table by source. Accuracy is over all splits; the oracle label is the cheapest tier that answered correctly ("none": no tier did). Output-token medians show the reasoning length each tier spends.]) <tab:data>

#text(weight: "bold")[Model tiers.] All three tiers are open-weight models with tool calling, served through OpenAI-compatible endpoints (prices per million tokens, input / output, USD):
#align(center, table(columns: 4, align: (left, left, right, right), inset: (x: 4pt, y: 2.4pt),
  table.hline(), [*Tier*], [*Model*], [*In*], [*Out*], table.hline(stroke: 0.4pt),
  ..tier_rows.map(r => r.map(x => [#x])).flatten(), table.hline()))
All #n_calls calls ran on a free API (actual spend \$0), so every cost is the public list price of the same model on a paid provider; the whole table would have cost \$#dataset_cost (#tok_in_m M input, #tok_out_m M output tokens). The small tier has no paid listing; its price is a _proxy_, the list price of a model of the same \~4B size class.

#wide(image("figures/dataset_acc.pdf", width: 100%), [Accuracy per source and tier (all #n_prompts prompts, Wilson 95% intervals). Black ticks: fraction of prompts answered correctly by at least one tier, the ceiling for any router. The medium tier matches or beats the large tier on most sources; the large tier's advantage concentrates on MMLU-Pro and agent triage.]) <fig:dataset>

The tiers are complementary rather than nested (@fig:patterns): #all_correct% of prompts are solved by all three tiers and #none_correct% by none, while #n_only_large prompts are solved _only_ by the large tier and #n_small_not_large are solved by the small tier but missed by the large one. Routing therefore has headroom (any-tier ceiling #acc_oracle_all% vs. #acc_large% for always-large) but cannot be reduced to a difficulty threshold.

#figure(image("figures/patterns.pdf", width: 100%), caption: [Correctness patterns over the three tiers (dots: tier correct). #n_patterns of 8 possible patterns occur.]) <fig:patterns>

#figure(image("figures/oracle_mix.pdf", width: 100%), caption: [Oracle-label mix per source. Most prompts are solvable by the small tier; the oracle needs the large tier rarely.]) <fig:oracle>

#wide(image("figures/cost_dist.pdf", width: 100%), [Per-call distributions by tier (dashed: medians). Output length dominates cost; the spike at the right of the large tier's token histogram is the generation cap. Median wall-clock latency on the free API: small #lat_small s, medium #lat_medium s, large #lat_large s (shared, rate-limited endpoints; not a serving benchmark).]) <fig:cost>

#text(weight: "bold")[Baselines.] Always-small/medium/large; uniform random; the oracle (hindsight, not achievable); zero-shot Laya; logistic regression and $k$-NN predicting the oracle tier from frozen embeddings (base Laya, mean-pooled; and all-MiniLM-L6-v2 @minilm2021card), with $C$ and $k$ tuned on validation; and per-tier correctness predictors, one logistic regression per tier estimating $P("correct"|s,a)$, acting by $arg max_a P("correct"|s,a) - lambda macron(c)_a \/ c_"ref"$ over the same $lambda$ grid. Jev: #jev_status.

#text(weight: "bold")[Metrics.] Test accuracy, mean cost per request, cost relative to always-large, and router latency, each with 95% percentile bootstrap intervals (#n_boot resamples); comparisons against always-large use paired bootstrap differences.

#figure(include "generated/hparam_table.typ", caption: [Training configuration.]) <tab:hparams>

// ------------------------------------------------------------------ 6
= Results <sec:results>

#wide(text(7.6pt, include "generated/results_table.typ"), [Test-set results (n = #n_test). Brackets: 95% bootstrap intervals. Per-tier LR rows are shown for a subset of $lambda$. Router latency: median single-request time on the build machine's GPU. Pareto: not dominated in (accuracy, cost) by another non-oracle policy.]) <tab:main>

The validation-selected `auto` policy ($lambda$ = #lam_auto) differs from always-large in accuracy by #auto_vs_large points (paired 95% CI #auto_vs_large_lo to #auto_vs_large_hi) while costing #auto_cost% as much (@tab:main). Zero-shot Laya reaches #zs_acc% at #zs_cost% cost, and the supervised warm start alone collapses to the majority oracle label (small).

#text(weight: "bold")[What RL actually learned.] Every policy with $lambda > 0$ routes most requests to the medium tier (#rl_med_share% on average, @fig:lambda), the tier whose accuracy is within a point of the large tier's at a small fraction of its price (@fig:dataset). The learned policy is therefore close to the trivial always-medium baseline: `auto` differs from it by #auto_vs_med points (paired 95% CI #auto_vs_med_lo to #auto_vs_med_hi). RL discovered the right default tier from bandit feedback alone, but on this test set it does not reliably find the prompts that need the large tier: its largest per-source loss against always-large is on #worst_src (#worst_gap points, n = #worst_n; @fig:heat). The most accurate RL policy on the test split is $lambda$ = #best_lam (#best_acc% at #best_cost% cost); it was not selected because selection uses validation only.

@fig:pareto places the RL family against the per-tier correctness predictors, the strongest cheap baseline. At matched $lambda$ the two are within confidence intervals of each other; where the baselines match or beat the RL policies, the Laya router's remaining advantages are architectural (a single model scoring options directly, trainable from bandit feedback) rather than accuracy.

#wide(image("figures/pareto.pdf", width: 100%), [Accuracy vs. cost relative to always-large on the test split (symmetric-log cost axis). Shaded: 95% CI of the RL family; error bars: 95% CI; hollow diamond: hindsight oracle.]) <fig:pareto>

#wide(include "generated/paired_table.typ", [RL policies vs. always-large on the test split: paired accuracy difference and relative cost with 95% bootstrap intervals, test action share (small/medium/large), mean reward, and the selected checkpoint.]) <tab:paired>

#wide(grid(columns: 2, gutter: 1.2em, image("figures/lambda_sweep.pdf", width: 100%), image("figures/sft_curves.pdf", width: 100%)), [Left: effect of the cost weight, test action share (bars) with accuracy and relative cost (lines) for each trained $lambda$. Right: supervised warm start, loss (left axis) and validation agreement with the oracle label (right axis), which rises from #sft_zs_val% zero-shot to #sft_best_val% (epoch #sft_best_epoch; dotted).]) <fig:lambda>

#wide(image("figures/source_heatmap.pdf", width: 100%), [Per-source test accuracy (large digits, %) and cost relative to always-large (small text) for trivial policies, the oracle, Laya without RL, and the three RL modes. Agent-style slices are the two rightmost columns.]) <fig:heat>

#wide(image("figures/rl_curves.pdf", width: 100%), [RL training dynamics per $lambda$ (25-step moving averages over sampled actions): reward (left) and policy entropy (right; dashed: uniform policy).]) <fig:rl>



// ------------------------------------------------------------------ 7
= Analysis

#text(weight: "bold")[What the router learns.] @fig:confusion compares the `auto` policy's actions with the oracle label on the test split; it agrees with the oracle on #auto_oracle_agree% of prompts. Off-diagonal mass above the diagonal is money spent on a tier more expensive than necessary; mass below it is accuracy risked on a tier cheaper than the cheapest correct one.

#figure(image("figures/confusion.pdf", width: 72%), caption: [Router action vs. oracle label on the test split (counts) for `auto`.]) <fig:confusion>

#text(weight: "bold")[Confidence.] @fig:calib relates the policy's probability of its chosen tier to whether that tier answered correctly (point-biserial $r$ = #calib_r). The policy's probabilities are trained for reward, not calibrated for correctness; we report them as-is and do not use them for escalation.

#figure(image("figures/calibration.pdf", width: 72%), caption: [Reliability of the `auto` policy's confidence (bins with ≥ 3 prompts; Wilson 95% intervals) and its histogram.]) <fig:calib>

#if not draft [
  #wide(grid(columns: 3, gutter: 4pt, image("figures/brainmap_early.png"), image("figures/brainmap_mid.png"), image("figures/brainmap_final.png")),
    [UMAP @mcinnes2018umap of base-model prompt embeddings, coloured by the `auto` policy's chosen tier (teal = small, indigo = medium, pink = large; size = confidence) at the start, middle and end of RL.]) <fig:brain>
]

#wide(text(7.6pt, include "generated/source_table.typ"), [Per-source accuracy % / cost % of always-large on the test split.]) <tab:src>

// ------------------------------------------------------------------ 8
= System <sec:system>

#figure(system-diagram(width: 100%), caption: [Serving path. Agents point an OpenAI SDK at the proxy; Laya routes once per conversation and the chosen tier answers; routing metadata is returned in response headers. An MCP server exposes the same router as tools.]) <fig:system>

The router adds one encoder pass, #router_ms ms median on the build machine's GPU for `auto`. The proxy is OpenAI-compatible: it routes once per conversation (keyed by the system prompt and first user message, or an `x-session-id` header) and keeps that tier for the session so agent tool loops are never re-routed mid-task; tools, tool choice and tool messages pass through unchanged, including when streaming (@fig:system).

// ------------------------------------------------------------------ 9
= Limitations and future work

#note[The test set is small (n = #n_test), so intervals are wide; we use a single seed. The setting is offline: although RL uses only the sampled arm, the outcome table was collected with full information, which an online system would not have. Benchmark prompts are not production traffic, and the agent slice consists of synthetic single-function tasks. Costs are list prices of a free-API run, one of them a proxy price. Laya is known to degrade with many options @laya2026card, which is irrelevant at three tiers but limits extension to many models. Jev was not benchmarked.]

Planned work: partial-feedback online RL with a feedback endpoint; comparison with an exact expected-reward objective (possible offline because all outcomes are known); evaluation on RouterBench @hu2024routerbench; out-of-distribution tests; more tiers; multiple seeds; calibration.

= Reproducibility

Code, configs and this report's sources are at commit #raw(commit). `config/models.yaml` (tiers, prices) and `config/train.yaml` (splits, hyperparameters, $lambda$ grid, seed) define the run. Pipeline: `data/build_prompts.py` → `data/run_models.py` → `eval.features` → `eval.baselines` → `router.sft` → `router.rl` → `eval.evaluate` → `eval.export_viz` → `paper/build.py`. Every number, table and figure in this report is regenerated from the evaluation outputs by `paper/gen_tables.py` and `paper/gen_extra.py`.

#set text(8pt)
#bibliography("refs.bib", style: "ieee", title: [References])
