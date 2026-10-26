# X launch posts (drafts)

Rules: punchy first line, **one** measured number per post, one visual, tag the host + Alan, no "Jev killer" language, no claim the eval didn't produce.
`{{…}}` values are filled by `python scripts/fill_launch.py` from `eval/results/all.json` / `web/public/data/manifest.json`. **Never type a number by hand.** Fill in handles: `@HOST_HANDLE`, `@ALAN_HANDLE`.

---

## 1 · Mon night — first rising reward curve
**Visual:** `launch/reward_curve.png` (λ = 0.5 train reward)

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
> 948 prompts, each placed by what the model thinks it means. Colour = which model it would pay for. Watch whole regions flip to cheap as RL kicks in.
>
> End state: 2% of always-large cost on held-out prompts. @HOST_HANDLE @ALAN_HANDLE

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

> Built for #Openfire: an open decision model, trained with RL, that sends each LLM call to the cheapest model that gets it right.
>
> On 189 held-out prompts: 81.5% accuracy at 2% of always-large cost. One base_url change, and Alan's agents run through it.
>
> Live: {{site_url}} · Code + report: {{repo_url}}
