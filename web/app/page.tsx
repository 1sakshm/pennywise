"use client";
import AgentRace from "@/components/AgentRace";
import AlanConnector from "@/components/AlanConnector";
import BeatTheRouter from "@/components/BeatTheRouter";
import PolicyGalaxy from "@/components/galaxy/PolicyGalaxy";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import LiveMode from "@/components/LiveMode";
import ParetoArena from "@/components/ParetoArena";
import { Reveal, ScrollProgress, SectionHead, SmoothScroll } from "@/components/fx";
import { useData, useStore } from "@/components/Store";

type Bench = { tasks: number; speedup: number; pennywise: { merged: number; minutes: number }; alan: { minutes: number } };

function SpeedBadge() {
  const b = useData<Bench>("agent_bench.json");
  if (!b) return null;
  return (
    <a href="#top" className="speed" title={`Pennywise ${b.pennywise.minutes} min vs Alan Auto Router ${b.alan.minutes} min on ${b.tasks} agent coding tasks`}>
      <span className="led" />
      <b>{b.speedup.toFixed(1)}× faster</b><span className="long"> than Alan&apos;s router</span> · {b.pennywise.merged}/{b.tasks} ✓
      <style jsx>{`
        .speed { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--muted); text-decoration: none; border: 1px solid var(--line-2); border-radius: 3px; padding: 6px 10px; white-space: nowrap; }
        .speed b { color: var(--accent); font-weight: 500; }
        @media (max-width: 640px) { .long { display: none; } .speed { font-size: 10px; padding: 5px 8px; } }
      `}</style>
    </a>
  );
}

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/YOUR-USER/pennywise";
const NAV = [
  ["01", "race", "Race"],
  ["02", "alan", "In Alan"],
  ["03", "galaxy", "Galaxy"],
  ["04", "game", "Game"],
  ["05", "pareto", "Pareto"],
  ["06", "live", "Live"],
  ["07", "how", "Method"],
] as const;

export default function Home() {
  const { manifest } = useStore();
  return (
    <main>
      <SmoothScroll />
      <ScrollProgress />
      {manifest?.synthetic && <div className="banner-synthetic">synthetic dev data — every number on this page is fabricated for development. not results.</div>}
      <nav className="topbar">
        <div className="wrap tb">
          <a href="#" className="brand" aria-label="Pennywise home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={24} height={24} alt="" aria-hidden />
            pennywise
          </a>
          <div className="links">
            {NAV.map(([n, id, label]) => (
              <a key={id} href={`#${id}`}>
                <span className="n">{n}</span>
                {label}
              </a>
            ))}
            <a href="/paper.pdf" target="_blank" rel="noreferrer">
              Paper ↗
            </a>
          </div>
          <SpeedBadge />
        </div>
      </nav>

      <Hero />

      <section className="block" id="race">
        <div className="wrap">
          <SectionHead
            n="01"
            kicker="Head-to-head"
            meta="measured timings · same tasks · same tests"
            title={<>Pennywise vs. Alan&apos;s <em>Auto Router</em></>}
            lede="Both systems got the same 10 agent coding tasks, from an off-by-one fix to an O(1) LRU cache and a hand-written expression parser, with the same one-line instruction and no hints. This replays what actually happened, task by task, sped up."
          />
          <Reveal delay={0.1}>
            <AgentRace />
          </Reveal>
        </div>
      </section>

      <section className="block" id="alan">
        <div className="wrap">
          <SectionHead
            n="02"
            kicker="In Alan"
            meta="npm · MCP connector · runs on your CPU"
            title={<>One connector. Pennywise <em>inside</em> Alan.</>}
            lede="pennywise-mcp is on npm. Add it as a custom Command connector and every Alan agent can call the RL-trained router as a tool: route a request to small, medium or large, or answer it with the routed open model. No Python, no server to host."
          />
          <Reveal delay={0.1}>
            <AlanConnector />
          </Reveal>
        </div>
      </section>

      <section className="block" id="galaxy">
        <div className="wrap">
          <SectionHead
            n="03"
            kicker="Policy galaxy"
            meta="UMAP · checkpoints every 40 steps"
            title={<>Watch reinforcement learning <em>reshape</em> the policy</>}
            lede="Every point is a prompt, placed by what the frozen base model thinks it means. Colour is the tier the policy picks; size is its confidence. Press play to step through training checkpoints and watch regions flip from expensive to cheap as the reward comes in."
          />
          <Reveal delay={0.1}>
            <PolicyGalaxy />
          </Reveal>
        </div>
      </section>

      <section className="block" id="game">
        <div className="wrap">
          <SectionHead
            n="04"
            kicker="Beat the router"
            meta="held-out prompts · real graded outcomes"
            title={<>Can you pick the <em>cheapest</em> model that gets it right?</>}
            lede="Real held-out prompts, real graded outcomes from all three models. Laya has seen none of them."
          />
          <Reveal delay={0.1}>
            <BeatTheRouter />
          </Reveal>
        </div>
      </section>

      <section className="block" id="pareto">
        <div className="wrap">
          <SectionHead
            n="05"
            kicker="Pareto arena"
            meta="test split · 95% bootstrap CIs"
            title={<>One knob from <em>cheap</em> to <em>careful</em></>}
            lede="Each λ trains a separate policy. Slide it to move along the cost/accuracy curve; the routing trace above follows. Baselines are fixed points, including the cheap embedding baselines a reviewer would ask for first."
          />
          <Reveal delay={0.1}>
            <ParetoArena />
          </Reveal>
        </div>
      </section>

      <section className="block" id="live">
        <div className="wrap">
          <SectionHead n="06" kicker="Live" meta="openai-compatible proxy" title={<>Route your <em>own</em> request</>} />
          <Reveal delay={0.1}>
            <LiveMode />
          </Reveal>
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <SectionHead n="07" kicker="Method" meta="contextual bandit · REINFORCE" title={<>Request → decision → outcome → <em>reward</em></>} />
          <Reveal delay={0.1}>
            <HowItWorks />
          </Reveal>
        </div>
      </section>

      <footer className="block">
        <div className="wrap foot">
          <div className="fl">
            <div className="brand big">pennywise</div>
            <p>An RL-trained open decision model that routes LLM requests to the cheapest tier that will still get them right.</p>
            <a className="btn primary" href="/paper.pdf" target="_blank" rel="noreferrer">
              Technical report v0.1 (PDF) ↗
            </a>
          </div>
          <dl className="meta">
            <div><dt>release</dt><dd>v0.1 · Oct 27, 2026 · preliminary, not peer-reviewed</dd></div>
            <div><dt>model</dt><dd>Laya by Convai Innovations (Apache-2.0)</dd></div>
            <div><dt>built for</dt><dd>Openfire with Alan</dd></div>
            {manifest?.commit && <div><dt>data</dt><dd className="mono">@ {manifest.commit}{manifest.synthetic ? " · synthetic" : ""}</dd></div>}
            {process.env.NEXT_PUBLIC_REPO_URL && <div><dt>source</dt><dd><a href={REPO}>GitHub ↗</a></dd></div>}
          </dl>
        </div>
      </footer>
      <style jsx>{`
        .topbar { position: sticky; top: ${manifest?.synthetic ? "25px" : "0"}; z-index: 50; background: rgba(6, 7, 10, 0.86);
          border-bottom: 1px solid var(--line); backdrop-filter: saturate(140%) blur(10px); -webkit-backdrop-filter: saturate(140%) blur(10px); }
        .tb { display: flex; align-items: center; gap: 20px; height: 52px; }
        .brand { display: inline-flex; gap: 9px; align-items: center; font-family: var(--font-mono); text-decoration: none; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
        .links { display: flex; gap: 2px; margin-right: auto; margin-left: 12px; }
        .links a { font-family: var(--font-mono); font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); text-decoration: none; padding: 6px 9px; border-radius: 3px; white-space: nowrap; transition: color 0.2s, background 0.2s; }
        .links a:hover { color: var(--text); background: rgba(255, 255, 255, 0.04); }
        .links .n { color: var(--dim); margin-right: 6px; }
        .foot { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; }
        .fl p { color: var(--muted); max-width: 420px; margin: 10px 0 20px; }
        .brand.big { font-size: 15px; }
        .meta { margin: 0; display: flex; flex-direction: column; }
        .meta > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px dashed var(--line); font-size: 13.5px; }
        .meta dt { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); padding-top: 2px; }
        .meta dd { margin: 0; color: var(--muted); }
        @media (max-width: 900px) { .links { display: none; } .tb { justify-content: space-between; } }
        @media (max-width: 760px) { .foot { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
