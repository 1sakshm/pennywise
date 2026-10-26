"use client";
import { motion } from "framer-motion";
import { pct } from "@/lib/data";
import { CountUp, playGalaxy, StaggerWords } from "./fx";
import ParticleRouter from "./ParticleRouter";
import { useStore } from "./Store";

const p1 = (v: number) => `${(100 * v).toFixed(1)}%`;
const p0 = (v: number) => `${Math.round(100 * v)}%`;
const ease = [0.2, 0.8, 0.2, 1] as const;

export default function Hero() {
  const { manifest, lambda } = useStore();
  const h = manifest?.headline;
  const tm = manifest?.tier_models;
  const spec: [string, React.ReactNode][] = [
    ["policy", <>Laya · ModernBERT-large · 421M</>],
    ["action", <><span className="tier-small">small</span> / <span className="tier-medium">medium</span> / <span className="tier-large">large</span></>],
    ["reward", <span className="math">r = correct(a) − λ · c(a) / c<sub>ref</sub></span>],
    ["training", <>SFT warm start → REINFORCE</>],
    ["inference", <>one forward pass{h?.router_latency_ms != null ? ` · ${Math.round(h.router_latency_ms)} ms GPU` : ""}</>],
    ["auto mode", <><span className="math">λ</span> = {manifest ? manifest.modes.auto : "—"}</>],
  ];
  return (
    <header className="hero">
      <div className="wrap">
        <motion.div className="top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
          <span className="eyebrow">open decision model · trained with reinforcement learning · apache-2.0</span>
        </motion.div>
        <div className="grid">
          <div className="left">
            <h1>
              <StaggerWords text="Jev chooses." />
              <br />
              <span className="l2">
                <StaggerWords text="This one" delay={0.2} /> <em><StaggerWords text="learns." delay={0.34} /></em>
              </span>
            </h1>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.8, ease }}>
              {h ? (
                <p className="result">
                  <b><CountUp value={h.accuracy} format={p1} /></b> accuracy at <b><CountUp value={h.cost_vs_large} format={p0} /></b> of the cost of
                  always calling the largest model.
                  <span className="scope">
                    held-out test set · n = {manifest!.n_test} · 95% CI {pct(h.accuracy_ci[0])}–{pct(h.accuracy_ci[1])} acc, {pct(h.cost_vs_large_ci[0], 0)}–
                    {pct(h.cost_vs_large_ci[1], 0)} cost · always-large {pct(h.large_accuracy)}
                  </span>
                </p>
              ) : (
                <p className="result dim">Loading measured results<span className="caret" /></p>
              )}
              <p className="lede">
                Pennywise is a 421M-parameter open decision model that reads each LLM request and sends it to the cheapest model tier that will still get it
                right. Its output distribution <span className="math">π(a|s)</span> <em>is</em> a policy, so we train it with reinforcement learning on real graded
                outcomes, and you can watch it learn. One <code>base_url</code> change puts it in front of your agents.
              </p>
              <div className="cta">
                <button className="btn accent" onClick={playGalaxy}>▶ Watch it learn</button>
                <a className="btn" href="#game">Beat the router <span className="arrow">→</span></a>
                <a className="btn" href="#live">Try it live <span className="arrow">→</span></a>
                <a className="btn" href="/paper.pdf" target="_blank" rel="noreferrer">Report (PDF) ↗</a>
              </div>
            </motion.div>
          </div>
          <motion.aside className="panel" style={{ marginTop: 10 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.9, ease }}>
            <div className="fig-head">
              <span className="fig-id">SPEC</span>
              <span>router</span>
              <span className="sp" />
              <span className="led" />
            </div>
            <dl>
              {spec.map(([k, v], i) => (
                <motion.div key={k} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.06, duration: 0.6, ease }}>
                  <div className="row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                </motion.div>
              ))}
            </dl>
            {tm && (
              <div className="tiers">
                {(["small", "medium", "large"] as const).map((t) => (
                  <div key={t} className="trow">
                    <span className={`dot bg-${t}`} />
                    <span className="mname">{tm[t].model}</span>
                    <span className="price">${tm[t].price_in_per_m}/${tm[t].price_out_per_m}</span>
                  </div>
                ))}
                <div className="pnote">list price per 1M tokens (in/out) · runs used a free API</div>
              </div>
            )}
            <div className="lam mono">selected <span className="lc">λ</span> = {lambda} · drag it in §03</div>
          </motion.aside>
        </div>
        <div className="fig"><motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.9, ease }}>
          <ParticleRouter />
        </motion.div></div>
      </div>
      <style jsx>{`
        .hero { position: relative; padding: clamp(36px, 6vw, 72px) 0 clamp(56px, 8vw, 96px); }
        .top { margin-bottom: clamp(18px, 3vw, 28px); }
        .grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: clamp(24px, 4vw, 56px); align-items: start; }
        h1 { font-size: clamp(46px, 8vw, 108px); font-weight: 550; letter-spacing: -0.055em; line-height: 0.95; margin: 0 0 26px; }
        h1 .l2 { color: var(--muted); }
        h1 em { color: var(--accent); font-size: 1.08em; letter-spacing: -0.02em; padding-right: 0.06em; }
        .result { font-size: clamp(18px, 2.1vw, 23px); margin: 0 0 14px; max-width: 760px; letter-spacing: -0.015em; line-height: 1.4; }
        .result b { color: var(--accent); font-family: var(--font-mono); font-weight: 500; font-variant-numeric: tabular-nums; }
        .result.dim { color: var(--muted); }
        .scope { display: block; font-family: var(--font-mono); font-size: 11.5px; color: var(--dim); margin-top: 8px; letter-spacing: 0.02em; }
        .cta { display: flex; gap: 8px; flex-wrap: wrap; }
        code { font-size: 0.9em; color: var(--text); }
                dl { margin: 0; padding: 6px 14px 10px; }
        .row { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13.5px; }
        dl > :global(div:last-child) .row { border-bottom: 0; }
        .lc { text-transform: none; font-family: var(--font-serif); font-style: italic; font-size: 13px; }
        dt { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); padding-top: 2px; }
        dd { margin: 0; }
        dd .math { font-size: 15px; }
        .tiers { border-top: 1px solid var(--line); padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
        .trow { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-family: var(--font-mono); font-size: 11.5px; }
        .mname { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .price { color: var(--dim); font-variant-numeric: tabular-nums; }
        .pnote { font-family: var(--font-mono); font-size: 10px; color: var(--dim); }
        .lam { border-top: 1px solid var(--line); padding: 8px 14px; font-size: 11px; color: var(--dim); letter-spacing: 0.06em; text-transform: uppercase; }
        .fig { margin-top: clamp(40px, 6vw, 64px); }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } .grid > :global(aside) { max-width: 520px; } }
      `}</style>
    </header>
  );
}
