"use client";

export default function HowItWorks() {
  return (
    <div className="hiw">
      <svg viewBox="0 0 900 230" width="100%" role="img" aria-label="Architecture: request to proxy, Laya picks a tier, tier answers, outcome becomes reward">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#8b93a7" />
          </marker>
        </defs>
        {[
          { x: 10, label: "Agent / app", sub: "OpenAI SDK, OpenCode, Alan" },
          { x: 200, label: "Proxy", sub: "/v1/chat/completions" },
          { x: 390, label: "Laya", sub: "π(a | request) · 1 pass", hl: true },
        ].map((b) => (
          <g key={b.label}>
            <rect x={b.x} y={70} width={160} height={74} rx={12} fill={b.hl ? "rgba(250,204,21,.08)" : "#0b0d14"} stroke={b.hl ? "#facc15" : "rgba(148,163,184,.3)"} />
            <text x={b.x + 80} y={102} fill="#e6e9f2" fontSize="15" textAnchor="middle">{b.label}</text>
            <text x={b.x + 80} y={124} fill="#8b93a7" fontSize="11" textAnchor="middle">{b.sub}</text>
          </g>
        ))}
        <line x1={170} y1={107} x2={196} y2={107} stroke="#8b93a7" markerEnd="url(#ah)" />
        <line x1={360} y1={107} x2={386} y2={107} stroke="#8b93a7" markerEnd="url(#ah)" />
        {(["small", "medium", "large"] as const).map((t, i) => (
          <g key={t}>
            <path d={`M550,107 C600,107 600,${40 + i * 67} 650,${40 + i * 67}`} fill="none" stroke={`var(--${t})`} markerEnd="url(#ah)" />
            <rect x={654} y={20 + i * 67} width={130} height={40} rx={10} fill="#0b0d14" stroke={`var(--${t})`} />
            <text x={719} y={45 + i * 67} fill={`var(--${t})`} fontSize="13" textAnchor="middle">{t} model</text>
          </g>
        ))}
        <path d="M784,107 C850,107 850,205 470,205 L470,148" fill="none" stroke="#4ade80" strokeDasharray="4 4" markerEnd="url(#ah)" />
        <text x={640} y={222} fill="#4ade80" fontSize="12" textAnchor="middle">reward r = correct(a) − λ · cost(a) / cost_ref  →  REINFORCE update</text>
      </svg>
      <div className="cols">
        <div>
          <h3>A decision model&apos;s output is a policy</h3>
          <p>Laya scores every option at its own <code>[MASK]</code> marker in one non-autoregressive forward pass. A softmax over the three tier options is a full action distribution π(a|s) — no sampling of tokens, no generation. That makes policy-gradient RL cheap and clean: one pass gives log π for every action.</p>
        </div>
        <div>
          <h3>Reward = right answer, minus what it cost</h3>
          <p>
            Each training prompt was run on all three tiers and graded automatically (math answers, unit tests, multiple choice, agent bug-fix and CI-triage tasks). RL samples an action, looks up only that arm&apos;s outcome — the online bandit setting — and
            updates with REINFORCE, a running-mean baseline and an entropy bonus. Sweeping λ gives a family of policies: the cost/quality knob.
          </p>
        </div>
        <div>
          <h3>What it isn&apos;t</h3>
          <p>An offline experiment on benchmark-style prompts with a small test set and one seed. Confidence intervals are shown everywhere; the strongest cheap baseline (per-tier logistic regression on embeddings) is plotted next to it, including where it wins.</p>
        </div>
      </div>
      <style jsx>{`
        .hiw { display: flex; flex-direction: column; gap: 28px; }
        .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
        h3 { font-size: 18px; margin-bottom: 8px; }
        p { color: var(--muted); margin: 0; font-size: 15px; }
        code { color: var(--text); }
        @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
