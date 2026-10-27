"use client";
import { motion } from "framer-motion";
import { CountUp, playGalaxy, StaggerWords } from "./fx";
import ParticleRouter from "./ParticleRouter";
import { useData, useStore } from "./Store";

const ease = [0.2, 0.8, 0.2, 1] as const;
type Arm = { label: string; merged: number; minutes: number; by_level: Record<string, string>; routed_to?: string[] };
type Bench = { tasks: number; pennywise: Arm; alan: Arm; speedup: number; scope: string; merged_means: string };

export default function Hero() {
  const { manifest, lambda } = useStore();
  const h = manifest?.headline;
  const bench = useData<Bench>("agent_bench.json");
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
              {bench ? (
                <div className="result">
                  <p className="big">
                    <b><CountUp value={bench.speedup} format={(v) => `${v.toFixed(1)}×`} /></b> faster than Alan&apos;s Auto Router, with the same{" "}
                    <b>{bench.pennywise.merged}/{bench.tasks}</b> agent coding tasks merged.
                  </p>
                  <div className="race" role="img" aria-label={`Pennywise ${bench.pennywise.minutes} minutes, Alan Auto Router ${bench.alan.minutes} minutes`}>
                    {[bench.pennywise, bench.alan].map((arm, i) => (
                      <div key={arm.label} className="lane">
                        <span className="who">{i === 0 ? "Pennywise" : "Alan Auto Router"}</span>
                        <div className="track">
                          <motion.div className={`bar ${i === 0 ? "pw" : "al"}`} initial={{ scaleX: 0 }} animate={{ scaleX: arm.minutes / bench.alan.minutes }}
                            transition={{ delay: 0.9 + i * 0.15, duration: 1.4 * (arm.minutes / bench.alan.minutes) + 0.4, ease }} />
                        </div>
                        <span className="t">{arm.minutes.toFixed(1)} min · {arm.merged}/{bench.tasks} ✓</span>
                      </div>
                    ))}
                  </div>
                  <span className="scope">{bench.scope} Merged = {bench.merged_means}.</span>
                </div>
              ) : (
                <p className="result dim">Loading measured results<span className="caret" /></p>
              )}
              <p className="lede">
                Pennywise is a 421M-parameter open decision model that reads each request and sends it to the model tier that will get it right. Its output
                distribution <span className="math">π(a|s)</span> <em>is</em> a policy, trained with reinforcement learning on real graded outcomes. In agent
                sessions a tool-call cascade checks every step and escalates the moment the fast tier slips, so agents finish sooner. One <code>base_url</code>{" "}
                change puts it in front of your agents.
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
                  </div>
                ))}
              </div>
            )}
            <div className="lam mono">selected <span className="lc">λ</span> = {lambda} · drag it in §04</div>
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
        .big { margin: 0 0 14px; }
        .race { display: flex; flex-direction: column; gap: 8px; max-width: 640px; margin: 4px 0 2px; }
        .lane { display: grid; grid-template-columns: 128px minmax(0, 1fr) 128px; gap: 10px; align-items: center; font-family: var(--font-mono); font-size: 12px; }
        .who { color: var(--muted); letter-spacing: 0.04em; }
        .track { height: 10px; background: rgba(148, 163, 184, 0.08); border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
        .race :global(.bar) { height: 100%; transform-origin: 0 50%; }
        .race :global(.bar.pw) { background: var(--accent); }
        .race :global(.bar.al) { background: #64748b; }
        .t { color: var(--text); font-variant-numeric: tabular-nums; }
        @media (max-width: 560px) { .lane { grid-template-columns: 1fr; gap: 4px; } }
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
        .lam { border-top: 1px solid var(--line); padding: 8px 14px; font-size: 11px; color: var(--dim); letter-spacing: 0.06em; text-transform: uppercase; }
        .fig { margin-top: clamp(40px, 6vw, 64px); }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } .grid > :global(aside) { max-width: 520px; } }
      `}</style>
    </header>
  );
}
