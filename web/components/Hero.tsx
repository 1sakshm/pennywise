"use client";
import { motion } from "framer-motion";
import { pct } from "@/lib/data";
import ParticleRouter from "./ParticleRouter";
import { useStore } from "./Store";

export default function Hero() {
  const { manifest } = useStore();
  const h = manifest?.headline;
  return (
    <header className="hero">
      <div className="wrap">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="eyebrow">open decision model · trained with reinforcement learning · Apache-2.0</div>
          <h1>
            Jev chooses.
            <br />
            <span className="grad">This one learns.</span>
          </h1>
          {h ? (
            <p className="num">
              <b>{pct(h.accuracy)}</b> accuracy at <b>{pct(h.cost_vs_large, 0)}</b> of the cost of always calling the largest model
              <span className="scope">
                {" "}
                — held-out test set, n = {manifest!.n_test} benchmark + agent prompts, 95% CI {pct(h.cost_vs_large_ci[0], 0)}–{pct(h.cost_vs_large_ci[1], 0)} cost
                {" "}· always-large scores {pct(h.large_accuracy)}
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
            <a className="btn primary" href="#galaxy">Watch it learn</a>
            <a className="btn" href="#game">Beat the router</a>
            <a className="btn" href="#live">Try it live</a>
            <a className="btn" href="/paper.pdf" target="_blank" rel="noreferrer">Technical Report v0.1 (PDF)</a>
          </div>
        </motion.div>
        <div className="pr">
          <ParticleRouter />
        </div>
      </div>
      <style jsx>{`
        .hero { padding: clamp(40px, 7vw, 88px) 0 clamp(40px, 6vw, 72px); }
        h1 { font-size: clamp(44px, 8.5vw, 104px); margin: 14px 0 18px; font-weight: 700; letter-spacing: -0.045em; line-height: 0.95; }
        .grad { background: linear-gradient(90deg, var(--small), var(--medium) 50%, var(--large)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .num { font-size: clamp(18px, 2.4vw, 26px); margin: 0 0 14px; max-width: 900px; }
        .num b { color: var(--accent); font-family: var(--font-mono); }
        .scope { display: block; font-size: 13px; color: var(--muted); margin-top: 4px; }
        .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 36px; }
        code { font-size: 0.92em; }
      `}</style>
    </header>
  );
}
