"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pct, SOURCE_LABEL, TIERS, usd, type Game, type GameRound, type Tier } from "@/lib/data";
import { useData } from "./Store";

const ROUNDS = 10;
const SECONDS = 10;

function shuffle<T>(a: T[]) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
}

export default function BeatTheRouter() {
  const game = useData<Game>("game.json");
  const [deck, setDeck] = useState<GameRound[] | null>(null);
  const [r, setR] = useState(0);
  const [pick, setPick] = useState<Tier | "timeout" | null>(null);
  const [left, setLeft] = useState(SECONDS);
  const [you, setYou] = useState(0);
  const [laya, setLaya] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [phase, setPhase] = useState<"intro" | "play" | "end">("intro");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const b = localStorage.getItem("btr-best");
      if (b) setBest(+b);
    } catch {}
  }, []);

  const start = useCallback(() => {
    if (!game) return;
    setDeck(shuffle(game.rounds).slice(0, ROUNDS));
    setR(0);
    setYou(0);
    setLaya(0);
    setPick(null);
    setLeft(SECONDS);
    setPhase("play");
  }, [game]);

  const round = deck?.[r];
  const choose = useCallback(
    (t: Tier | "timeout") => {
      if (!round || pick) return;
      setPick(t);
      if (t === round.oracle) setYou((x) => x + 1);
      if (round.router === round.oracle) setLaya((x) => x + 1);
    },
    [round, pick],
  );

  useEffect(() => {
    if (phase !== "play" || pick) return;
    setLeft(SECONDS);
    timer.current = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase, r, pick]);
  useEffect(() => {
    if (left <= 0 && !pick && phase === "play") choose("timeout");
  }, [left, pick, phase, choose]);

  const next = () => {
    if (!deck) return;
    if (r + 1 >= deck.length) {
      setPhase("end");
      try {
        const b = Math.max(best ?? 0, you);
        localStorage.setItem("btr-best", String(b));
        setBest(b);
      } catch {}
      return;
    }
    setR(r + 1);
    setPick(null);
  };

  const shareText = `I scored ${you} vs Laya's ${laya} on Beat the Router — picking the cheapest LLM that still gets it right. Can you beat it?`;
  const cardUrl = useMemo(() => `${siteUrl()}/share/game?you=${you}&laya=${laya}&n=${ROUNDS}`, [you, laya]);

  if (!game) return <div className="panel" style={{ padding: 24, color: "var(--muted)" }}>Loading game…</div>;

  return (
    <div className="btr panel">
      {phase === "intro" && (
        <div className="intro">
          <p className="rule">
            You see a request. Pick the cheapest model that will still answer it correctly — the exact reward Laya was trained on.
            {` ${ROUNDS} rounds, ${SECONDS} seconds each.`}
          </p>
          <button className="btn primary" onClick={start}>
            Play Beat the Router
          </button>
          {best != null && <span className="chip">your best: {best}/{ROUNDS}</span>}
        </div>
      )}

      {phase === "play" && round && (
        <div className="play">
          <div className="top">
            <span className="chip">
              round {r + 1}/{deck!.length}
            </span>
            <span className="chip">{SOURCE_LABEL[round.source] ?? round.source}</span>
            <span className="score">
              You <b>{you}</b> – <b>{laya}</b> Laya
            </span>
          </div>
          <div className="timer" aria-hidden>
            <motion.div
              key={`${r}-${!!pick}`}
              initial={{ scaleX: pick ? (left / SECONDS) : 1 }}
              animate={{ scaleX: pick ? left / SECONDS : 0 }}
              transition={{ duration: pick ? 0 : SECONDS, ease: "linear" }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.pre key={round.id} className="prompt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {round.prompt}
            </motion.pre>
          </AnimatePresence>
          <div className="choices">
            {TIERS.map((t, i) => {
              const reveal = !!pick;
              const ok = round.correct[i] === 1;
              const isOracle = round.oracle === t;
              return (
                <motion.button
                  key={t}
                  className={`choice ${pick === t ? "picked" : ""} ${reveal && isOracle ? "oracle" : ""}`}
                  onClick={() => choose(t)}
                  disabled={reveal}
                  whileTap={{ scale: 0.97 }}
                  style={{ borderColor: `var(--${t})` }}
                >
                  <span className={`name tier-${t}`}>{t}</span>
                  {reveal && (
                    <motion.span className="out" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * i }}>
                      <span style={{ color: ok ? "var(--ok)" : "var(--bad)" }}>{ok ? "✓ correct" : "✗ wrong"}</span>
                      <span className="cost">{usd(round.cost[i])}</span>
                      {round.router === t && <span className="laya">Laya · {pct(round.router_conf, 0)}</span>}
                      {isOracle && <span className="best">best pick</span>}
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
          {pick && (
            <motion.div className="verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span>
                {pick === "timeout" ? "Time's up." : pick === round.oracle ? "+1 — cheapest correct model." : "No point."}{" "}
                Laya picked <b className={`tier-${round.router}`}>{round.router}</b>
                {round.router === round.oracle ? " (+1)." : " (no point)."}
              </span>
              <button className="btn primary" onClick={next}>
                {r + 1 >= deck!.length ? "See result" : "Next →"}
              </button>
            </motion.div>
          )}
        </div>
      )}

      {phase === "end" && (
        <motion.div className="end" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="eyebrow">final score</div>
          <div className="big">
            You {you} <span>–</span> {laya} Laya
          </div>
          <p className="lede">{you > laya ? "You beat the router. Respect." : you === laya ? "Dead heat." : "The router wins this one."}</p>
          <div className="row">
            <a
              className="btn primary"
              target="_blank"
              rel="noreferrer"
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(cardUrl)}`}
            >
              Share on X
            </a>
            <a className="btn" href={`/api/og/game?you=${you}&laya=${laya}&n=${ROUNDS}`} target="_blank" rel="noreferrer">
              Share card image
            </a>
            <button className="btn" onClick={start}>
              Play again
            </button>
          </div>
        </motion.div>
      )}

      <style jsx>{`
        .btr { padding: clamp(16px, 3vw, 28px); }
        .intro { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
        .rule { margin: 0; color: var(--muted); max-width: 620px; }
        .top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .score { margin-left: auto; font-family: var(--font-mono); }
        .timer { height: 3px; background: var(--line); border-radius: 3px; overflow: hidden; margin: 14px 0; }
        .timer :global(div) { height: 100%; background: var(--accent); transform-origin: left; }
        .btr :global(.prompt) { white-space: pre-wrap; font-family: var(--font-mono); font-size: 14px; background: #070910; border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin: 0 0 14px; max-height: 240px; overflow: auto; }
        .btr :global(.choices) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .btr :global(.choice) { text-align: left; background: rgba(255, 255, 255, 0.02); border: 1px solid; border-radius: 12px; padding: 14px; cursor: pointer; min-height: 64px; display: flex; flex-direction: column; gap: 6px; }
        .btr :global(.choice:disabled) { cursor: default; }
        .btr :global(.choice.picked) { background: rgba(255, 255, 255, 0.08); }
        .btr :global(.choice.oracle) { box-shadow: 0 0 0 2px var(--accent) inset; }
        .btr :global(.name) { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; }
        .btr :global(.out) { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
        .btr :global(.cost) { color: var(--muted); font-family: var(--font-mono); }
        .btr :global(.laya) { color: var(--accent); }
        .btr :global(.best) { font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; }
        .btr :global(.verdict) { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
        .btr :global(.end) { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0; }
        .btr :global(.big) { font-size: clamp(36px, 7vw, 72px); font-weight: 700; font-family: var(--font-mono); }
        .btr :global(.big span) { color: var(--dim); }
        .btr :global(.row) { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        @media (max-width: 600px) { .choices { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
