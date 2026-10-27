# X launch posts (drafts)

Rules: punchy first line, **one** measured number per post, one visual, tag the host + Alan, no "Jev killer" language, no claim the eval didn't produce.
`{{…}}` values are filled by `python scripts/fill_launch.py` from `eval/results/all.json` / `web/public/data/manifest.json`. **Never type a number by hand.** Fill in handles: `@HOST_HANDLE`, `@ALAN_HANDLE`.

---

## 1 · Mon night — first rising reward curve
**Visual:** `launch/reward_curve.png` (λ = {{lam_auto}} train reward)

> watching an open decision model learn to route LLM calls with RL
>
> Laya (open, 421M params) outputs a probability over {small, medium, large} in one forward pass, and that distribution *is* a policy. So I'm training it with REINFORCE on reward = correct − λ·cost.
>
> First curve below. Building in public for #Openfire @HOST_HANDLE @ALAN_HANDLE

---

## 2 · Tue morning — the galaxy timelapse
**Visual:** `launch/galaxy_timelapse.mp4` (square, 15 s)

> Jev chooses. This one learns.
>
> {{n_prompts}} prompts, each placed by what the model thinks it means. Colour = which model it would pay for. Watch whole regions flip to cheap as RL kicks in.
>
> Then I raced it against Alan's own Auto Router on {{bench_tasks}} agent coding tasks: same {{bench_merged}}/{{bench_tasks}} merged, {{bench_speedup}}× faster ({{bench_pw_min}} vs {{bench_alan_min}} min). @HOST_HANDLE @ALAN_HANDLE

---

## 3 · Tue afternoon — Beat the Router
**Visual:** game end-screen card (`/api/og/game?...`)

> Can you beat an RL-trained router at its own game?
>
> 10 real prompts. Pick the cheapest LLM that'll still get it right. 10 seconds each. Laya has never seen them.
>
> {{site_url}}/#game  — post your score 👇 @HOST_HANDLE @ALAN_HANDLE

---

## 4 · Submission quote-post (quote the official Alan launch video)
**Visual:** the 1–2 min judge cut

> Built for #Openfire: Pennywise, an open decision model trained with RL that routes every LLM call, plus a tool-call cascade that keeps agents moving.
>
> Head-to-head with Alan's Auto Router on {{bench_tasks}} agent coding tasks: {{bench_merged}}/{{bench_tasks}} merged for both, and Pennywise finished {{bench_speedup}}× faster ({{bench_pw_min}} min vs {{bench_alan_min}} min). One base_url change.
>
> Live: {{site_url}} · Code + report: {{repo_url}}
