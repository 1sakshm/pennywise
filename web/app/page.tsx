"use client";
import BeatTheRouter from "@/components/BeatTheRouter";
import PolicyGalaxy from "@/components/galaxy/PolicyGalaxy";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import LiveMode from "@/components/LiveMode";
import ParetoArena from "@/components/ParetoArena";
import SavingsCounter from "@/components/SavingsCounter";
import { Reveal } from "@/components/fx";
import { useStore } from "@/components/Store";

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/YOUR-USER/laya-router";

export default function Home() {
  const { manifest } = useStore();
  return (
    <main>
      {manifest?.synthetic && <div className="banner-synthetic">SYNTHETIC DEV DATA — every number on this page is fabricated for development. Not results.</div>}
      <div className="topbar">
        <div className="wrap tb">
          <a href="#" className="brand">
            <span className="dot" style={{ background: "var(--accent)" }} /> laya-router
          </a>
          <SavingsCounter />
        </div>
      </div>

      <Hero />

      <section className="block" id="galaxy">
        <div className="wrap">
<Reveal>
          <div className="eyebrow">policy galaxy</div>
          <h2>Watch reinforcement learning reshape the policy</h2>
          <p className="lede">
            Every point is a prompt, placed by what the frozen base model thinks it means. Colour is the tier the policy picks; size is its confidence.
            Press play to step through training checkpoints and watch regions flip from expensive to cheap as the reward comes in.
          </p>
</Reveal>
<Reveal delay={0.15}>
          <PolicyGalaxy />
</Reveal>
        </div>
      </section>

      <section className="block" id="game">
        <div className="wrap">
<Reveal>
          <div className="eyebrow">beat the router</div>
          <h2>Can you pick the cheapest model that gets it right?</h2>
          <p className="lede">Real held-out prompts, real graded outcomes from all three models. Laya has seen none of them.</p>
</Reveal>
<Reveal delay={0.15}>
          <BeatTheRouter />
</Reveal>
        </div>
      </section>

      <section className="block" id="pareto">
        <div className="wrap">
<Reveal>
          <div className="eyebrow">pareto arena</div>
          <h2>One knob from cheap to careful</h2>
          <p className="lede">
            Each λ trains a separate policy. Slide it to move along the cost/accuracy curve; the hero animation follows. Baselines are fixed points — including the
            cheap embedding baselines a reviewer would ask for first.
          </p>
</Reveal>
<Reveal delay={0.15}>
          <ParetoArena />
</Reveal>
        </div>
      </section>

      <section className="block" id="live">
        <div className="wrap">
<Reveal>
          <div className="eyebrow">live</div>
          <h2>Route your own request</h2>
</Reveal>
<Reveal delay={0.15}>
          <LiveMode />
</Reveal>
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
<Reveal>
          <div className="eyebrow">how it works</div>
          <h2>Request → decision → outcome → reward</h2>
</Reveal>
<Reveal delay={0.15}>
          <HowItWorks />
</Reveal>
        </div>
      </section>

      <footer className="block">
        <div className="wrap foot">
          <div>
            <a className="btn primary" href="/paper.pdf" target="_blank" rel="noreferrer">Technical Report v0.1 (PDF)</a>
            <ul className="log">
              <li>v0.1 — Oct 27, 2026: initial hackathon release (preliminary, not peer-reviewed)</li>
            </ul>
          </div>
          <div className="links">
            <a href={REPO}>GitHub</a>
            <span>Built for Openfire with Alan · Laya by Convai Innovations (Apache-2.0)</span>
            {manifest?.commit && <span className="mono">data @ {manifest.commit}</span>}
          </div>
        </div>
      </footer>
      <style jsx>{`
        .topbar { position: sticky; top: ${manifest?.synthetic ? "28px" : "0"}; z-index: 50; padding: 10px 0; background: linear-gradient(#05060a, rgba(5, 6, 10, 0)); }
        .tb { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .brand { display: inline-flex; gap: 8px; align-items: center; font-family: var(--font-mono); text-decoration: none; font-size: 14px; }
        .foot { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
        .log { color: var(--muted); font-size: 13px; padding-left: 18px; }
        .links { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 13px; }
      `}</style>
    </main>
  );
}
