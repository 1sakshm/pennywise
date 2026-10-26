"use client";
import { motion } from "framer-motion";
import { pct } from "@/lib/data";
import { CountUp, playGalaxy, StaggerWords } from "./fx";
import ParticleRouter from "./ParticleRouter";
import { useStore } from "./Store";

const p1 = (v: number) => `${(100 * v).toFixed(1)}%`;
const p0 = (v: number) => `${Math.round(100 * v)}%`;

export default function Hero() {
  const { manifest } = useStore();
  const h = manifest?.headline;
  return (
    <header className="hero">
      <div className="aurora" aria-hidden>
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="stars" aria-hidden />
      <div className="wrap">
        <motion.div className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
          open decision model · trained with reinforcement learning · Apache-2.0
        </motion.div>
        <h1>
          <StaggerWords text="Jev chooses." />
          <br />
          <StaggerWords text="This one learns." className="gradient-text" delay={0.25} />
        </h1>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.6 }}>
          {h ? (
            <p className="num">
              <b>
                <CountUp value={h.accuracy} format={p1} />
              </b>{" "}
              accuracy at{" "}
              <b>
                <CountUp value={h.cost_vs_large} format={p0} />
              </b>{" "}
              of the cost of always calling the largest model
              <span className="scope">
                held-out test set, n = {manifest!.n_test} benchmark + agent prompts · 95% CI {pct(h.cost_vs_large_ci[0], 0)}–{pct(h.cost_vs_large_ci[1], 0)} cost ·
                always-large scores {pct(h.large_accuracy)}
              </span>
            </p>
          ) : (
            <p className="num">Loading measured results…</p>
          )}
          <p className="lede">
            An open, 421M-parameter Laya decision model reads each LLM request and picks the cheapest model tier that will still get it right — in
            {h?.router_latency_ms != null ? ` ~${Math.round(h.router_latency_ms)} ms on a GPU` : " milliseconds"}. Its output distribution <em>is</em> a policy, so we train
            it with RL on real outcomes and you can watch it learn. One <code>base_url</code> change routes your agents through it, lowering
            Alan&apos;s <b>dollars per merged PR</b>.
          </p>
          <div className="cta">
            <motion.button className="btn primary" onClick={playGalaxy} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              ▶ Watch it learn
            </motion.button>
            <a className="btn" href="#game">Beat the router</a>
            <a className="btn" href="#live">Try it live</a>
            <a className="btn" href="/paper.pdf" target="_blank" rel="noreferrer">Technical Report v0.1 (PDF)</a>
          </div>
        </motion.div>
        <motion.div className="pr" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.8 }}>
          <ParticleRouter />
        </motion.div>
      </div>
      <style jsx>{`
        .hero { position: relative; padding: clamp(40px, 7vw, 88px) 0 clamp(40px, 6vw, 72px); overflow: hidden; }
        h1 { font-size: clamp(44px, 8.5vw, 104px); margin: 14px 0 18px; font-weight: 700; letter-spacing: -0.045em; line-height: 0.98; }
        .num { font-size: clamp(18px, 2.4vw, 26px); margin: 0 0 14px; max-width: 900px; }
        .num b { color: var(--accent); font-family: var(--font-mono); text-shadow: 0 0 24px rgba(250, 204, 21, 0.35); }
        .scope { display: block; font-size: 13px; color: var(--muted); margin-top: 4px; }
        .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 36px; }
        code { font-size: 0.92em; }
      `}</style>
    </header>
  );
}
