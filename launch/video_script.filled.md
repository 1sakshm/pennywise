# Video scripts

Captions on in both cuts. **First frame = the race bar + headline.** `{{…}}` values are filled from eval outputs by
`scripts/fill_launch.py`. Never type a number by hand. The X submission allows 1–3 minutes.

## A · Fast cut (25–30 s)
| t | shot | caption / VO |
|---|---|---|
| 0–5 s | site hero: race bar animating (Pennywise vs Alan Auto Router) | "3.4× faster than Alan's Auto Router. Same 10/10 tasks merged." |
| 5–11 s | galaxy timelapse, step 0 → final | "An open decision model that learned, with RL, which model each request needs." |
| 11–17 s | Fig. 4 training-loop diagram animating (§05 Method) | "Every agent step is checked. If the fast model slips, it escalates instantly." |
| 17–23 s | Beat the Router: pick → reveal | "Think you can route better? Play it." |
| 23–30 s | Integrate panel: `base_url=` highlighted, copy | "One line to plug it in. Open source." |

## B · Judge cut (1–2 min)
| t | shot | VO |
|---|---|---|
| 0–8 s | site hero, race bar animating | "Coding agents spend most of their time waiting on models. Pennywise routes every call, and on 10 agent coding tasks it finished 3.4× faster than Alan's own Auto Router, with the same 10/10 merged." |
| 8–25 s | galaxy timelapse with the reward curve | "Under the hood is Laya, an open decision model. One forward pass gives a probability over small, medium and large, and that's a policy. We trained it with reinforcement learning on real graded outcomes." |
| 25–45 s | **split screen: OpenCode with `pennywise/auto` vs Alan Code with Auto Router on the same task folder**; terminal tail of `cascade:` lines | "In agent sessions, a tool-call cascade checks every step: tool names, arguments, file paths, empty replies, and a 30-second budget. If the fast tier slips, that step goes to a stronger model and the session stays there." |
| 45–65 s | paper Fig. 13 (per-task + total time) and Table 6 | "Same tasks, same tests, one run each. Pennywise: 11.0 minutes. Alan's Auto Router: 36.9 minutes. Both 10 of 10. A small live comparison, not a benchmark suite." |
| 65–80 s | Alan app: MCP → custom connector `pennywise` calling `route` | "And it plugs into Alan itself, as an MCP connector or as the model behind OpenCode." |
| 80–100 s | architecture diagram + paper title page | "Open weights, open code, every number generated from the runs. The technical report is linked." |

If you can't record the split screen, use the paper's Fig. 13 for 25–45 s instead. Don't show placeholder numbers.
