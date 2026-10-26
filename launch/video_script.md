# Video scripts

Captions on in both cuts. **First frame = galaxy + headline number.** `{{…}}` values are filled from eval outputs by `scripts/fill_launch.py`.

## A · Fast cut (25–30 s)
| t | shot | caption / VO |
|---|---|---|
| 0–4 s | `/capture` galaxy at full colour, headline overlay | "{{auto_acc}}% accuracy at {{auto_cost}}% of the cost." |
| 4–10 s | galaxy timelapse, step 0 → final | "An open decision model learning, with RL, which LLM each request needs." |
| 10–16 s | Pareto arena, λ slider dragged; hero particles re-route | "One knob from cheap to careful." |
| 16–23 s | Beat the Router: pick → reveal → "You 6 – 8 Laya" | "Think you can route better? Play it." |
| 23–30 s | Integrate panel: `base_url=` highlighted, copy | "One line to plug it in. Open source." |

## B · Judge cut (1–2 min)
| t | shot | VO |
|---|---|---|
| 0–8 s | galaxy + headline number | "Agents pay frontier prices for every call. Alan measures it as dollars per merged PR. Most calls don't need the biggest model." |
| 8–25 s | galaxy timelapse with the reward curve | "Laya is an open decision model. One forward pass gives a probability over small, medium and large, which is a policy. We train it with REINFORCE on 'right answer minus what it cost'." |
| 25–40 s | Pareto arena with CI band, baselines visible | "Each λ is a different policy. Here's where it sits against always-large and the cheap baselines: {{auto_acc}}% accuracy at {{auto_cost}}% of the cost on {{n_test}} held-out prompts." |
| 40–65 s | **Alan session running through OpenCode → proxy**; terminal tail of `x-router-tier` headers; Savings Counter ticking | "Here are Alan's agents with the router as their model: sticky per-session routing, tool calls passed through." |
| 65–75 s | before/after table: $ per merged PR | "On {{alan_n}} small tasks, $ per merged PR went from {{alan_before}} to {{alan_after}}. A small live demo, not a benchmark." |
| 75–90 s | screen-recording of Alan's Orchestrator + agents building the share cards / MCP server | "And parts of this project were built by Alan's own agents." |
| 90–110 s | architecture diagram (How It Works) | "Request, proxy, Laya, tier, outcome, reward. Open weights, open code, technical report linked." |

If the Alan before/after runs don't happen, cut 65–75 s and say so in the README. Don't show placeholder numbers.
