"use client";
import Architecture from "@/components/Architecture";

const COLS = [
  {
    k: "6.1",
    tag: "policy",
    title: <>A decision model&apos;s output is a <em>policy</em></>,
    body: (
      <>
        Laya scores every option at its own <code>[MASK]</code> marker in one non-autoregressive forward pass. A softmax over the three tier options is a full
        action distribution <span className="math">π(a|s)</span> — no sampling of tokens, no generation. That makes policy-gradient RL cheap and clean: one pass
        gives <span className="math">log π</span> for every action.
      </>
    ),
  },
  {
    k: "6.2",
    tag: "reward",
    title: <>Reward = right answer, minus what it <em>cost</em></>,
    body: (
      <>
        Each training prompt was run on all three tiers and graded automatically (math answers, unit tests, multiple choice, agent bug-fix and CI-triage tasks).
        RL samples an action, looks up only that arm&apos;s outcome — the online bandit setting — and updates with REINFORCE, a running-mean baseline and an
        entropy bonus. Sweeping <span className="math">λ</span> gives a family of policies: the cost/quality knob.
      </>
    ),
  },
  {
    k: "6.3",
    tag: "limits",
    title: <>What it <em>isn&apos;t</em></>,
    body: (
      <>
        An offline experiment on benchmark-style prompts with a small test set and one seed. Confidence intervals are shown everywhere; the strongest cheap
        baseline (per-tier logistic regression on embeddings) is plotted next to it, including where it wins.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <div className="hiw">
      <figure className="hiw-fig">
        <div className="panel">
          <div className="fig-head">
            <span className="fig-id">FIG. 4</span>
            <span className="ttl">Training loop · one REINFORCE step</span>
            <span className="sp" />
            <span className="hint">scroll →</span>
            <span className="led" />
          </div>
          <div className="hiw-body">
            <Architecture />
          </div>
        </div>
        <figcaption className="fig-cap">
          <b>Fig. 4 —</b> Laya reads the request once; the logits at the three <code>[MASK]</code> slots form <span className="math">π(a|s)</span>. A sampled tier
          answers, the grader scores it, and the cost-penalised reward updates only the top 4 layers and the decision head; layers 1–24 stay frozen and their
          activations are cached. Illustrative animation of one training step; not a recorded trajectory.
        </figcaption>
      </figure>

      <div className="cols">
        {COLS.map((c) => (
          <div className="col" key={c.k}>
            <div className="col-k">
              <span className="n">§{c.k}</span>
              <span>{c.tag}</span>
            </div>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
      <style jsx>{`
        .hiw { display: flex; flex-direction: column; gap: 48px; margin-top: 8px; }
        .hiw-fig { margin: 0; }
        .hiw-body { padding: 18px 18px 12px; }
        .hint { display: none; color: var(--dim); }
        .hiw-fig .fig-head { white-space: nowrap; }
        .ttl { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; border-top: 1px solid var(--line-2); }
        .col { padding: 18px 24px 0 0; }
        .col + .col { padding-left: 24px; border-left: 1px solid var(--line); }
        .col-k { display: flex; gap: 10px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
        .col-k .n { color: var(--accent); }
        h3 { font-size: 19px; margin-bottom: 10px; line-height: 1.2; }
        h3 :global(em) { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: 1.12em; letter-spacing: -0.005em; }
        p { color: var(--muted); margin: 0; font-size: 14.5px; line-height: 1.65; }
        code { color: var(--text); font-size: 0.9em; }
        p :global(.math), .fig-cap :global(.math) { color: var(--text); font-size: 1.12em; }
        @media (max-width: 860px) {
          .cols { grid-template-columns: 1fr; }
          .col, .col + .col { padding: 18px 0 18px; border-left: 0; }
          .col + .col { border-top: 1px solid var(--line); }
        }
        @media (max-width: 760px) {
          .hint { display: inline; }
          .hiw-body { padding: 12px 0 8px 12px; }
        }
      `}</style>
    </div>
  );
}
