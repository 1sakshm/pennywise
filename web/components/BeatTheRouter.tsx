"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pct, SOURCE_LABEL, TIERS, usd, type Game, type GameRound, type Tier } from "@/lib/data";
import { Burst } from "./fx";
import { useData } from "./Store";

const ROUNDS = 10;
const SECONDS = 10;
const EASE = [0.2, 0.8, 0.2, 1] as const;

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

const pad = (n: number) => String(n).padStart(2, "0");

/** Score digit that rolls in when it changes. */
function Tick({ v }: { v: number }) {
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
      <motion.span
        key={v}
        style={{ display: "inline-block" }}
        initial={{ y: "-60%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        {pad(v)}
      </motion.span>
    </span>
  );
}

type Hist = { you: boolean; laya: boolean };

export default function BeatTheRouter() {
  const game = useData<Game>("game.json");
  const reduce = useReducedMotion();
  const [deck, setDeck] = useState<GameRound[] | null>(null);
  const [r, setR] = useState(0);
  const [pick, setPick] = useState<Tier | "timeout" | null>(null);
  const [left, setLeft] = useState(SECONDS);
  const [you, setYou] = useState(0);
  const [laya, setLaya] = useState(0);
  const [hist, setHist] = useState<Hist[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [phase, setPhase] = useState<"intro" | "play" | "end">("intro");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [burst, setBurst] = useState(0);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    try {
      const b = localStorage.getItem("btr-best");
      if (b) setBest(+b);
    } catch {}
  }, []);

  // Keyboard shortcuts only apply while the console is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setVisible(es[es.length - 1].isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [game]);

  const start = useCallback(() => {
    if (!game) return;
    setDeck(shuffle(game.rounds).slice(0, ROUNDS));
    setR(0);
    setYou(0);
    setLaya(0);
    setHist([]);
    setPick(null);
    setLeft(SECONDS);
    setPhase("play");
  }, [game]);

  const round = deck?.[r];
  const choose = useCallback(
    (t: Tier | "timeout") => {
      if (!round || pick) return;
      setPick(t);
      const youOk = t === round.oracle;
      const layaOk = round.router === round.oracle;
      if (youOk) {
        setYou((x) => x + 1);
        setBurst((b) => b + 1);
      } else setShake((k) => k + 1);
      if (layaOk) setLaya((x) => x + 1);
      setHist((h) => [...h, { you: youOk, laya: layaOk }]);
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

  const next = useCallback(() => {
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
  }, [deck, r, best, you]);

  useEffect(() => {
    if (phase !== "play" || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0 && !pick) {
        e.preventDefault();
        choose(TIERS[i]);
      } else if (pick && (e.key === "Enter" || e.key === "ArrowRight") && !(tg && tg.tagName === "BUTTON")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, visible, pick, choose, next]);

  const shareText = `I scored ${you} vs Laya's ${laya} on Beat the Router — picking the cheapest LLM that still gets it right. Can you beat it?`;
  const cardUrl = useMemo(() => `${siteUrl()}/share/game?you=${you}&laya=${laya}&n=${ROUNDS}`, [you, laya]);

  if (!game)
    return (
      <div className="panel" style={{ padding: 24, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Loading experiment<span className="caret" />
      </div>
    );

  const n = deck?.length ?? ROUNDS;
  const verdict = you > laya ? "You beat the router." : you === laya ? "Dead heat." : "The router wins this one.";

  return (
    <div className="btr panel" ref={root}>
      <div className="fig-head">
        <span className="fig-id">EXPERIMENT</span>
        <span className="hide-sm">Beat the router</span>
        <span className="sp" />
        {phase === "play" ? (
          <span className="tab">
            Round {pad(r + 1)}/{pad(n)}
          </span>
        ) : phase === "end" ? (
          <span>Complete</span>
        ) : (
          <span>Standby</span>
        )}
        <span className={phase === "play" && !pick ? "led" : "led off"} />
      </div>

      {phase === "intro" && (
        <div className="body intro">
          <p className="rule">
            You see a held-out request. Pick the <b>cheapest</b> model that will still answer it correctly — the exact reward Laya was trained on.
          </p>
          <dl className="proto">
            <div><dt>Rounds</dt><dd>{ROUNDS}</dd></div>
            <div><dt>Time / round</dt><dd>{SECONDS} s</dd></div>
            <div><dt>Pool</dt><dd>{game.rounds.length} prompts</dd></div>
            <div><dt>Policy</dt><dd><span className="math">λ</span> = {game.lambda}</dd></div>
            <div><dt>Reward</dt><dd><span className="math">r</span> = 1[cheapest correct]</dd></div>
          </dl>
          <div className="introrow">
            <button className="btn primary" onClick={start}>
              Start experiment <span className="arrow">→</span>
            </button>
            <span className="hint hide-sm">
              keys <span className="kbd">1</span> <span className="kbd">2</span> <span className="kbd">3</span> to pick · <span className="kbd">↵</span> next
            </span>
            {best != null && <span className="chip tab">best {best}/{ROUNDS}</span>}
          </div>
        </div>
      )}

      {phase === "play" && round && (
        <div className="body play">
          <div className="top">
            <div className="clock">
              <div className="timer" aria-hidden>
                <motion.div
                  key={`${r}-${!!pick}`}
                  initial={{ scaleX: pick ? left / SECONDS : 1 }}
                  animate={{ scaleX: pick ? left / SECONDS : 0 }}
                  transition={{ duration: pick ? 0 : SECONDS, ease: "linear" }}
                />
              </div>
              <span className={`secs tab ${!pick && left <= 3 ? "low" : ""}`} aria-label={`${Math.max(0, left)} seconds left`}>
                {pick ? "--" : pad(Math.max(0, left))}.0 s
              </span>
            </div>
            <div className="score tab" aria-label={`You ${you}, Laya ${laya}`}>
              <span className="who">You</span>
              <b><Tick v={you} /></b>
              <span className="colon">:</span>
              <b><Tick v={laya} /></b>
              <span className="who">Laya</span>
            </div>
          </div>

          <div className="tape" aria-hidden>
            {Array.from({ length: n }, (_, i) => {
              const h = hist[i];
              return (
                <span key={i} className={`cell ${i === r ? "cur" : ""}`}>
                  <i className={h ? (h.you ? "ok" : "bad") : ""} />
                  <i className={h ? (h.laya ? "ok" : "bad") : ""} />
                </span>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={round.id}
              className="specimen"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="spec-head">
                <span>Specimen</span>
                <span className="sid">{round.id}</span>
                <span className="sp" />
                <span className="src">{SOURCE_LABEL[round.source] ?? round.source}</span>
              </div>
              <pre className="prompt">{round.prompt}</pre>
            </motion.div>
          </AnimatePresence>

          <div className={shake ? "choices nudge" : "choices"} key={"c" + shake} style={{ position: "relative" }}>
            <div className="burst-wrap" aria-hidden>
              <Burst trigger={burst} colors={["#2dd4bf", "#818cf8", "#f472b6"]} />
            </div>
            {TIERS.map((t, i) => {
              const reveal = !!pick;
              const ok = round.correct[i] === 1;
              const isOracle = round.oracle === t;
              const isLaya = round.router === t;
              return (
                <motion.button
                  key={t}
                  className={`choice c-${t} ${pick === t ? "picked" : ""} ${reveal && isOracle ? "oracle" : ""} ${reveal ? "revealed" : ""}`}
                  onClick={() => choose(t)}
                  disabled={reveal}
                  whileTap={reveal ? undefined : { scale: 0.985 }}
                  aria-keyshortcuts={String(i + 1)}
                >
                  <span className="stripe" aria-hidden />
                  <span className="c-top">
                    <span className={`name tier-${t}`}>{t}</span>
                    <span className="kbd">{i + 1}</span>
                  </span>
                  <span className="c-cost tab">
                    <span className="k">cost<span className="hide-sm"> on this prompt</span></span>
                    <span className="v">{usd(round.cost[i])}</span>
                  </span>
                  <span className="c-out">
                    {reveal ? (
                      <motion.span className="graded" initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.35, ease: EASE }}>
                        <span className={`mark ${ok ? "ok" : "bad"}`}>{ok ? "✓" : "✗"}</span>
                        <span className="k">{ok ? "graded correct" : "graded wrong"}</span>
                      </motion.span>
                    ) : (
                      <span className="graded pending">
                        <span className="mark">?</span>
                        <span className="k">ungraded</span>
                      </span>
                    )}
                    <span className="laya">
                      <span className="k">
                        Laya <span className="math">π</span>
                      </span>
                      <span className="ltrack">
                        <motion.span
                          className={`lfill bg-${t}`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: reveal && isLaya ? round.router_conf : 0 }}
                          transition={{ delay: reveal ? 0.25 + 0.08 * i : 0, duration: 0.7, ease: EASE }}
                        />
                      </span>
                      <span className="lv tab">{reveal ? (isLaya ? pct(round.router_conf, 0) : "·") : "—"}</span>
                    </span>
                    <span className="tags">
                      {reveal && pick === t && <span className="tag you">your pick</span>}
                      {reveal && isLaya && <span className="tag lay">Laya&apos;s pick</span>}
                      {reveal && isOracle && <span className="tag best">cheapest correct</span>}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
          <AnimatePresence>
            {pick && (
              <motion.div className="verdict" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                <span className="vtxt">
                  <span className={pick === round.oracle ? "pos" : "neg"}>
                    {pick === "timeout" ? "Time's up." : pick === round.oracle ? "+1 — cheapest correct model." : "No point."}
                  </span>{" "}
                  Laya picked <b className={`tier-${round.router}`}>{round.router}</b>
                  {round.router === round.oracle ? " (+1)." : " (no point)."}
                </span>
                <button className="btn primary" onClick={next}>
                  {r + 1 >= deck!.length ? "See result" : "Next"} <span className="arrow">→</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {phase === "end" && (
        <motion.div
          className="body end"
          style={{ position: "relative" }}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="burst-wrap" aria-hidden>
            <Burst trigger={you >= laya ? 1 : 0} colors={["#2dd4bf", "#818cf8", "#f472b6"]} />
          </div>
          <div className="result">
            <div className="side">
              <span className="k">You</span>
              <span className={`big tab ${you >= laya ? "lead" : ""}`}>{pad(you)}</span>
            </div>
            <span className="vs">:</span>
            <div className="side">
              <span className="k">Laya</span>
              <span className={`big tab ${laya > you ? "lead" : ""}`}>{pad(laya)}</span>
            </div>
          </div>
          <p className="vline">{verdict}</p>
          <div className="tape end-tape" aria-hidden>
            {hist.map((h, i) => (
              <span key={i} className="cell">
                <i className={h.you ? "ok" : "bad"} />
                <i className={h.laya ? "ok" : "bad"} />
              </span>
            ))}
          </div>
          <div className="tape-legend">top row: you · bottom row: Laya · green = cheapest correct tier</div>
          <dl className="proto ends">
            <div><dt>Your hit rate</dt><dd className="tab">{pct(you / n, 0)}</dd></div>
            <div><dt>Laya hit rate</dt><dd className="tab">{pct(laya / n, 0)}</dd></div>
            <div><dt>Δ</dt><dd className="tab">{you - laya > 0 ? "+" : ""}{you - laya}</dd></div>
            <div><dt>Best</dt><dd className="tab">{best ?? you}/{ROUNDS}</dd></div>
          </dl>
          <div className="row">
            <a
              className="btn primary"
              target="_blank"
              rel="noreferrer"
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(cardUrl)}`}
            >
              Share on X
            </a>
            <a className="btn" href={`/share/game?you=${you}&laya=${laya}&n=${ROUNDS}`} target="_blank" rel="noreferrer">
              Share card image
            </a>
            <button className="btn" onClick={start}>
              Play again
            </button>
          </div>
        </motion.div>
      )}

      <style jsx>{`
        .btr { overflow: visible; }
        .btr .fig-head { white-space: nowrap; }
        .btr :global(.body) { padding: clamp(16px, 3vw, 28px); }
        .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }

        /* intro */
        .intro { display: flex; flex-direction: column; gap: 20px; align-items: flex-start; }
        .rule { margin: 0; color: var(--muted); max-width: 620px; }
        .rule b { color: var(--text); font-weight: 500; }
        .proto { display: grid; grid-template-columns: repeat(5, auto); gap: 0; margin: 0; border: 1px solid var(--line); border-radius: var(--radius); }
        .proto div { padding: 10px 16px; border-left: 1px solid var(--line); }
        .proto div:first-child { border-left: 0; }
        .proto dt { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
        .proto dd { margin: 2px 0 0; font-family: var(--font-mono); font-size: 14px; font-variant-numeric: tabular-nums; }
        .introrow { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .hint { font-family: var(--font-mono); font-size: 11px; color: var(--dim); }

        /* play */
        .top { display: flex; gap: 16px; align-items: center; justify-content: space-between; }
        .clock { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
        .timer { flex: 1; height: 2px; background: var(--line); overflow: hidden; }
        .timer :global(div) { height: 100%; background: var(--accent); transform-origin: left; }
        .secs { font-family: var(--font-mono); font-size: 12px; color: var(--muted); min-width: 52px; text-align: right; }
        .secs.low { color: var(--bad); }
        .score { display: flex; align-items: baseline; gap: 8px; font-family: var(--font-mono); }
        .score b { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
        .score .who { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
        .score .colon { color: var(--dim); }

        .tape { display: flex; gap: 3px; margin: 12px 0 16px; }
        .tape .cell { display: flex; flex-direction: column; gap: 2px; padding: 2px; border: 1px solid transparent; border-radius: 2px; }
        .tape .cell.cur { border-color: var(--line-2); }
        .tape i { display: block; width: 14px; height: 4px; background: var(--line); transition: background 0.4s var(--ease); }
        .tape i.ok { background: var(--ok); }
        .tape i.bad { background: rgba(248, 113, 113, 0.55); }

        .btr :global(.specimen) { border: 1px solid var(--line); border-radius: var(--radius); background: #07080c; margin-bottom: 14px; }
        .spec-head { display: flex; gap: 10px; align-items: center; padding: 6px 12px; border-bottom: 1px dashed var(--line); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); min-width: 0; }
        .spec-head .sid { color: var(--muted); letter-spacing: 0.04em; text-transform: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .spec-head .sp { flex: 1; }
        .spec-head .src { color: var(--text); border: 1px solid var(--line-2); border-radius: 3px; padding: 1px 6px; white-space: nowrap; }
        .prompt { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.65; padding: 14px; margin: 0; max-height: 240px; overflow: auto; color: var(--text); }

        .btr :global(.choices) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .burst-wrap { position: absolute; inset: 0; pointer-events: none; transform: scale(0.45); opacity: 0.8; z-index: 3; }
        .btr :global(.choice) {
          position: relative; text-align: left; background: var(--bg-2); border: 1px solid var(--line-2); border-radius: var(--radius);
          padding: 14px 14px 12px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; overflow: hidden;
          transition: border-color 0.25s var(--ease), background 0.25s var(--ease), opacity 0.35s var(--ease);
        }
        .btr :global(.choice:hover:not(:disabled)) { border-color: rgba(232, 235, 241, 0.45); background: #0d1016; }
        .btr :global(.choice:disabled) { cursor: default; }
        .btr :global(.choice.revealed:not(.oracle):not(.picked)) { opacity: 0.72; }
        .btr :global(.choice.oracle) { border-color: var(--accent); }
        .btr :global(.choice.picked) { background: #0f1218; }
        .btr :global(.stripe) { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
        .btr :global(.c-small .stripe) { background: var(--small); }
        .btr :global(.c-medium .stripe) { background: var(--medium); }
        .btr :global(.c-large .stripe) { background: var(--large); }
        .btr :global(.c-top) { display: flex; justify-content: space-between; align-items: center; }
        .btr :global(.name) { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; font-size: 15px; font-weight: 500; }
        .btr :global(.c-cost) { display: flex; flex-direction: column; gap: 1px; }
        .btr :global(.c-cost .v) { font-family: var(--font-mono); font-size: 18px; letter-spacing: -0.02em; }
        .btr :global(.c-out) { display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed var(--line); padding-top: 10px; }
        .btr :global(.graded) { display: flex; align-items: center; gap: 8px; }
        .btr :global(.mark) { width: 18px; height: 18px; display: inline-grid; place-items: center; border: 1px solid var(--line-2); border-radius: 2px; font-size: 12px; font-family: var(--font-mono); color: var(--dim); }
        .btr :global(.mark.ok) { color: var(--ok); border-color: rgba(74, 222, 128, 0.5); background: rgba(74, 222, 128, 0.08); }
        .btr :global(.mark.bad) { color: var(--bad); border-color: rgba(248, 113, 113, 0.5); background: rgba(248, 113, 113, 0.08); }
        .btr :global(.laya) { display: grid; grid-template-columns: 56px 1fr 34px; gap: 8px; align-items: center; }
        .btr :global(.ltrack) { height: 4px; background: var(--line); overflow: hidden; }
        .btr :global(.lfill) { display: block; height: 100%; transform-origin: left; }
        .btr :global(.lv) { font-family: var(--font-mono); font-size: 11px; color: var(--muted); text-align: right; }
        .btr :global(.tags) { display: flex; gap: 6px; flex-wrap: wrap; min-height: 18px; }
        .btr :global(.tag) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 6px; border-radius: 2px; border: 1px solid var(--line-2); color: var(--muted); }
        .btr :global(.tag.best) { color: #06070a; background: var(--accent); border-color: var(--accent); }
        .btr :global(.tag.you) { color: var(--text); }
        .btr :global(.nudge) { animation: nudge 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
        @keyframes nudge { 20%, 60% { transform: translateX(-3px); } 40%, 80% { transform: translateX(3px); } }

        .btr :global(.verdict) { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 14px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid var(--line); }
        .vtxt { font-size: 14px; color: var(--muted); }
        .vtxt b { font-family: var(--font-mono); text-transform: uppercase; font-weight: 500; font-size: 13px; letter-spacing: 0.06em; }
        .pos { color: var(--ok); }
        .neg { color: var(--text); }

        /* end */
        .btr :global(.end) { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: clamp(24px, 4vw, 40px); padding-bottom: clamp(24px, 4vw, 40px); }
        .result { display: flex; align-items: flex-end; gap: clamp(16px, 4vw, 40px); }
        .side { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .big { font-family: var(--font-mono); font-size: clamp(56px, 9vw, 96px); font-weight: 400; letter-spacing: -0.05em; line-height: 1; color: var(--muted); }
        .big.lead { color: var(--text); }
        .vs { font-family: var(--font-mono); font-size: clamp(36px, 6vw, 60px); color: var(--dim); line-height: 1.2; }
        .vline { margin: 4px 0 0; font-size: 17px; }
        .end-tape { margin: 6px 0 0; }
        .tape-legend { font-family: var(--font-mono); font-size: 10.5px; color: var(--dim); text-align: center; }
        .proto.ends { grid-template-columns: repeat(4, auto); margin-top: 6px; }
        .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }

        @media (max-width: 760px) {
          .proto { grid-template-columns: repeat(2, minmax(0, 1fr)); align-self: stretch; }
          .proto div { border-left: 0; border-top: 1px solid var(--line); }
          .proto div:nth-child(-n + 2) { border-top: 0; }
          .proto div:nth-child(even) { border-left: 1px solid var(--line); }
          .proto.ends { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .btr :global(.choices) { grid-template-columns: 1fr; gap: 8px; }
          .btr :global(.choice) { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); column-gap: 14px; row-gap: 6px; }
          .btr :global(.c-top) { grid-column: 1 / -1; }
          .btr :global(.c-out) { border-top: 0; padding-top: 0; border-left: 1px dashed var(--line); padding-left: 12px; }
          .hide-sm { display: none; }
        }
        @media (max-width: 420px) {
          .tape i { width: 10px; }
          .score b { font-size: 18px; }
          .secs { min-width: 44px; }
        }
      `}</style>
    </div>
  );
}
