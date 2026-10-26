"use client";
import dynamic from "next/dynamic";
import css from "styled-jsx/css";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { pct, SOURCE_LABEL, TIERS, type Training, type Umap } from "@/lib/data";
import { useData, useIsMobile, useReducedMotion, useStore } from "../Store";
import BrainMap2D from "./BrainMap2D";
import RewardCurve from "./RewardCurve";
import { pad, Range, Sparkline, useSize } from "./instrument";

const viewCss = css`
        .view { position: relative; height: clamp(380px, 58vw, 600px); overflow: hidden; background: #07080c; border-bottom: 1px solid var(--line); }
        .view.cap { height: 100vh; border: 0; }
        .tip { position: absolute; left: 0; top: 0; width: 280px; max-width: calc(100% - 16px); pointer-events: none; background: rgba(7, 8, 12, 0.96); border: 1px solid var(--line-2);
          border-radius: var(--radius); padding: 8px 10px; font-family: var(--font-mono); font-size: 11px; z-index: 5; color: var(--muted); }
        .tip-h { display: flex; justify-content: space-between; gap: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; color: var(--dim);
          border-bottom: 1px solid var(--line); padding-bottom: 5px; margin-bottom: 6px; }
        .pv { color: var(--text); font-family: var(--font-sans); font-size: 12.5px; line-height: 1.45; margin: 0 0 6px; }
        .tip-r { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
        .tip-r b { font-weight: 500; color: var(--text); }
        .vtop { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 10px; z-index: 3; }
        .vtop .seg { background: rgba(7, 8, 12, 0.9); }
        .vlab { background: rgba(7, 8, 12, 0.7); padding: 1px 4px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--dim); }
        @media (max-width: 560px) { .vlab { display: none; } }
        .legend { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; z-index: 3; pointer-events: none;
          font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
          background: rgba(7, 8, 12, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 9px; }
        .lg { display: inline-flex; align-items: center; gap: 6px; }
        .lg b { font-weight: 400; color: var(--text); font-variant-numeric: tabular-nums; min-width: 3ch; }
        .lg .dot { width: 6px; height: 6px; }
        .dimk { color: var(--dim); text-transform: none; }
        @media (max-width: 560px) { .dimk { display: none; } .legend { gap: 10px; } }
        .view :global(.hud) { position: absolute; right: 12px; top: 12px; width: 212px; padding: 0; z-index: 4; border-radius: var(--radius);
          background: rgba(7, 8, 12, 0.92); border: 1px solid var(--line-2); font-family: var(--font-mono); font-size: 11px; }
        .view :global(.hud-h) { display: flex; align-items: center; gap: 7px; padding: 6px 10px; border-bottom: 1px solid var(--line); color: var(--muted); letter-spacing: 0.1em; font-size: 10px; }
        .view :global(.hud-h .sp) { flex: 1; }
        .view :global(.hud-h .math) { font-size: 13px; color: var(--text); }
        .view :global(.hud-step) { display: flex; align-items: baseline; gap: 8px; padding: 8px 10px 4px; font-variant-numeric: tabular-nums; }
        .view :global(.hud-step > span:nth-child(2)) { font-size: 24px; color: var(--accent); letter-spacing: -0.02em; display: inline-block; }
        .view :global(.hud-step .k), .view :global(.hud-step .of) { font-size: 10px; color: var(--dim); letter-spacing: 0.1em; }
        .view :global(.hud-row) { display: flex; justify-content: space-between; padding: 2px 10px; color: var(--dim); letter-spacing: 0.06em; font-size: 10.5px; }
        .view :global(.hud-row b) { color: var(--text); font-weight: 400; font-variant-numeric: tabular-nums; font-size: 11.5px; }
        .view :global(.hud-spark) { padding: 6px 10px 6px; margin-top: 4px; border-top: 1px solid var(--line); }
        .view :global(.hud-bar) { height: 2px; background: var(--line); }
        .view :global(.hud-bar div) { height: 100%; background: var(--accent); transform-origin: 0 50%; transition: transform 0.4s var(--ease); }
        @media (max-width: 560px) { .view :global(.hud) { width: 150px; right: 8px; top: 8px; } .view :global(.hud-spark), .view :global(.hud-row) { display: none; } .view :global(.hud-step) { padding-bottom: 8px; } .view :global(.hud-h .math), .view :global(.hud-h .math + span) { display: none; } .view :global(.hud-step > span:nth-child(2)) { font-size: 20px; } }
        .overlay { position: absolute; left: 5%; top: 6%; right: 5%; pointer-events: none; }
        .overlay .big { font-size: clamp(40px, 7vw, 96px); font-family: var(--font-mono); font-weight: 600; }
        .overlay .nums { font-size: clamp(16px, 2vw, 26px); color: var(--muted); }
        .overlay .final { margin-top: 18px; font-size: clamp(22px, 3.2vw, 44px); color: var(--accent); font-weight: 600; }
`;

const Galaxy3D = dynamic(() => import("./Galaxy3D"), { ssr: false });

type Props = { capture?: boolean; lambdaOverride?: number; stepMs?: number };

export default function PolicyGalaxy({ capture = false, lambdaOverride, stepMs = 450 }: Props) {
  const { manifest } = useStore();
  const umap = useData<Umap>("umap.json");
  const [lam, setLam] = useState<number | null>(null);
  const L = lambdaOverride ?? lam ?? manifest?.modes.auto ?? null;
  const loaded = useData<Training>(L == null ? "manifest.json" : `training/${+L.toFixed(4)}.json`);
  // keep showing the previous run while the next λ's checkpoints load (no layout collapse)
  const lastTraining = useRef<Training | null>(null);
  if (loaded && "checkpoints" in loaded) lastTraining.current = loaded;
  const training = lastTraining.current;
  const cks = training ? training.checkpoints : null;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const [lowFps, setLowFps] = useState(false);
  const [force, setForce] = useState<"2d" | "3d" | null>(null);
  const use2D = force ? force === "2d" : mobile || reduced || lowFps;
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [setViewSize, vsize] = useSize<HTMLDivElement>();
  const autoplayed = useRef(false);

  // "Watch it learn" (hero) -> replay from step 0
  useEffect(() => {
    const h = () => {
      setIdx(0);
      setPlaying(true);
      autoplayed.current = true;
    };
    window.addEventListener("galaxy:play", h);
    return () => window.removeEventListener("galaxy:play", h);
  }, []);
  // auto-play once, the first time the galaxy is mostly on screen
  useEffect(() => {
    if (capture || reduced || !viewRef.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !autoplayed.current) {
          autoplayed.current = true;
          setIdx(0);
          setPlaying(true);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(viewRef.current);
    return () => io.disconnect();
  }, [capture, reduced, cks]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("galaxy2d") === "1") setLowFps(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (cks) {
      setIdx(capture ? 0 : cks.length - 1);
      setPlaying(capture);
    }
  }, [cks, capture]);
  useEffect(() => {
    if (!playing || !cks) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= cks.length - 1) {
          if (capture) return 0;
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, capture && idx === cks.length - 1 ? 2500 : Math.max(stepMs, 9000 / Math.max(1, cks.length - 1)));
    return () => clearInterval(id);
  }, [playing, cks, capture, stepMs, idx]);

  if (!umap || !cks || !manifest) return <div className="gal-empty">Loading galaxy…<style jsx global>{`.gal-empty { height: 400px; display: grid; place-items: center; color: var(--muted); border: 1px solid var(--line); border-radius: var(--radius); font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }`}</style></div>;
  const ci = Math.min(idx, cks.length - 1);
  const ck = cks[ci];
  const last = cks[cks.length - 1];
  const prevCk = ci > 0 ? cks[ci - 1] : null;
  const flipped = prevCk ? ck.action.reduce((a, v, i) => a + (v !== prevCk.action[i] ? 1 : 0), 0) : 0;
  const props = {
    umap,
    action: ck.action,
    prob: ck.prob,
    onHover: (i: number | null, x: number, y: number) => setHover(i == null ? null : { i, x, y }),
  };
  const h = hover;
  const atEnd = ci >= cks.length - 1;
  const stepW = String(last.step).length;
  const counts = umap.split.reduce<Record<string, number>>((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {});
  const share = TIERS.map((_, t) => ck.action.reduce((a, v) => a + (v === t ? 1 : 0), 0) / Math.max(1, ck.action.length));
  const tipLeft = h ? (h.x + 300 > (vsize.w || 9999) ? Math.max(8, h.x - 14 - 280) : h.x + 14) : 0;
  const tipTop = h ? (h.y + 130 > (vsize.h || 9999) ? Math.max(8, h.y - 14 - 110) : h.y + 14) : 0;
  const hudVisible = !capture && (playing || !mobile);
  const togglePlay = () => (atEnd ? (setIdx(0), setPlaying(true)) : setPlaying(!playing));

  const view = (
    <div
      className={capture ? "view cap" : "view"}
      id="galaxy-view"
      ref={(el) => {
        viewRef.current = el;
        setViewSize(el);
      }}
    >
      {use2D ? (
        <BrainMap2D {...props} animate={!reduced} />
      ) : (
        <Galaxy3D
          {...props}
          autoRotate={!reduced}
          onLowFps={() => {
            setLowFps(true);
            try {
              sessionStorage.setItem("galaxy2d", "1");
            } catch {}
          }}
        />
      )}
      {h && !capture && (
        <div className="tip" style={{ transform: `translate(${tipLeft}px, ${tipTop}px)` }}>
          <div className="tip-h">
            <span>{SOURCE_LABEL[umap.source[h.i]] ?? umap.source[h.i]}</span>
            <span>{umap.split[h.i]}</span>
          </div>
          <div className="pv">{umap.preview[h.i]}…</div>
          <div className="tip-r">
            <span>
              → <b className={`tier-${TIERS[ck.action[h.i]]}`}>{TIERS[ck.action[h.i]]}</b>
            </span>
            <span>
              p = <b>{ck.prob[h.i].toFixed(2)}</b>
            </span>
          </div>
        </div>
      )}
      {!capture && (
        <div className="vtop">
          <div className="seg" role="group" aria-label="Projection">
            <button aria-pressed={use2D} onClick={() => setForce("2d")}>2D</button>
            <button aria-pressed={!use2D} onClick={() => setForce("3d")}>3D</button>
          </div>
          <span className="vlab">{use2D ? "UMAP · 2 COMPONENTS" : "UMAP · 3 COMPONENTS · DRAG TO ORBIT"}</span>
        </div>
      )}
      <AnimatePresence>
        {hudVisible && (
          <motion.div
            className="hud"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="hud-h">
              <span className={playing ? "led" : "led off"} />
              <span>{playing ? "TRAINING" : "CHECKPOINT"}</span>
              <span className="sp" />
              <span className="math">λ</span>
              <span>= {L}</span>
            </div>
            <div className="hud-step">
              <span className="k">STEP</span>
              <motion.span key={ck.step} initial={{ opacity: 0.3, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {pad(ck.step, stepW)}
              </motion.span>
              <span className="of">/ {last.step}</span>
            </div>
            <div className="hud-row"><span>VAL ACC</span><b>{pct(ck.val.accuracy)}</b></div>
            <div className="hud-row"><span>COST / LARGE</span><b>{pct(ck.val.cost_vs_large, 1)}</b></div>
            <div className="hud-row"><span>FLIPPED</span><b>{flipped}</b></div>
            <div className="hud-row"><span>VAL REWARD</span><b>{ck.val.reward.toFixed(3)}</b></div>
            <div className="hud-spark">
              <Sparkline values={cks.map((c) => c.val.reward)} upto={ci} height={26} />
            </div>
            <div className="hud-bar">
              <div style={{ transform: `scaleX(${ci / Math.max(1, cks.length - 1)})` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!capture && (
        <div className="legend">
          {TIERS.map((t, i) => (
            <span key={t} className="lg">
              <span className={`dot bg-${t}`} /> {t}
              <b>{pct(share[i], 0)}</b>
            </span>
          ))}
          <span className="lg dimk">◦ size ∝ p(tier)</span>
        </div>
      )}
      {capture && (
        <div className="overlay">
          <div className="eyebrow">Laya learns to route LLM calls with RL · λ={L}</div>
          <div className="big">step {ck.step}</div>
          <div className="nums">
            val accuracy {pct(ck.val.accuracy)} · cost {pct(ck.val.cost_vs_large, 0)} of always-large
          </div>
          {ci === cks.length - 1 && (
            <div className="final">
              {pct(manifest.headline.accuracy)} accuracy at {pct(manifest.headline.cost_vs_large, 0)} of the cost — test set
            </div>
          )}
        </div>
      )}
      <style jsx>{viewCss}</style>
    </div>
  );

  return (
    <div className={capture ? "gal capture" : "gal"}>
      {capture ? (
        view
      ) : (
        <>
          <div className="panel">
            <div className="fig-head">
              <span className="fig-id">FIG. 2</span>
              <span className="fh-t">
                POLICY GALAXY<span className="fh-sub"> · UMAP OF BASE EMBEDDINGS</span>
              </span>
              <span className={playing ? "led" : "led off"} aria-hidden />
              <span className="sp" />
              <span className="fh-r">
                STEP {pad(ck.step, stepW)}/{last.step} · <span className="math">λ</span> {L}
              </span>
            </div>
            {view}
            <div className="ctl">
              <div className="row">
                <button className="btn playb" onClick={togglePlay} aria-label={playing ? "Pause training replay" : atEnd ? "Replay training" : "Play training"}>
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    {playing ? (
                      <path d="M2 1h2v8H2zM6 1h2v8H6z" fill="currentColor" />
                    ) : atEnd ? (
                      <path d="M8.5 5A3.5 3.5 0 1 1 5 1.5h1.5M5 0l1.6 1.5L5 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    ) : (
                      <path d="M2 1l7 4-7 4z" fill="currentColor" />
                    )}
                  </svg>
                  {playing ? "Pause" : atEnd ? "Replay" : "Play"}
                </button>
                <div className="scrub">
                  <Range
                    value={ci}
                    min={0}
                    max={cks.length - 1}
                    label="Training checkpoint"
                    onChange={(v) => {
                      setPlaying(false);
                      setIdx(v);
                    }}
                    stops={cks.length <= 40 ? cks.map((c, i) => ({ v: i, label: cks.length <= 12 || i === 0 || i === cks.length - 1 ? String(c.step) : undefined })) : undefined}
                  />
                </div>
                <div className="lamsel">
                  <span className="lk">
                    <span className="math">λ</span>
                  </span>
                  <div className="seg" role="group" aria-label="Lambda">
                    {manifest.lambdas.map((l) => (
                      <button key={l} aria-pressed={l === L} onClick={() => setLam(l)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="stats">
                <div className="stat"><span className="v">{pad(ck.step, stepW)}</span><span className="k">training step</span></div>
                <div className="stat"><span className="v">{pct(ck.val.accuracy)}</span><span className="k">val accuracy</span></div>
                <div className="stat"><span className="v">{pct(ck.val.cost_vs_large, 1)}</span><span className="k">val cost / large</span></div>
                <div className="stat"><span className="v">{ck.val.reward.toFixed(3)}</span><span className="k">val reward</span></div>
              </div>
              <RewardCurve cks={cks} idx={ci} />
            </div>
          </div>
          <p className="fig-cap">
            <b>Fig. 2 —</b> Each point is one of {umap.ids.length} prompts ({counts.train ?? 0} train · {counts.val ?? 0} val · {counts.test ?? 0} test), placed
            by a UMAP projection of the frozen base model&apos;s embeddings. Colour is the tier the <span className="math">λ</span> = {L} policy picks at the
            selected checkpoint; size is its probability for that tier (test points drawn 1.25× larger). Points that change tier between checkpoints flash
            white. Readouts and the reward curve are on the validation split; the dashed curve is the moving-average training reward.
          </p>
        </>
      )}
      <style jsx>{`
        .gal { display: block; min-width: 0; }
        .fig-head > * { flex-shrink: 0; }
        .fh-t { flex-shrink: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .fh-r { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--text); }
        .fh-r .math, .lk .math { font-size: 14px; text-transform: none; }
        @media (max-width: 720px) { .fh-sub { display: none; } }
        @media (max-width: 440px) { .fig-head { gap: 8px; padding: 9px 10px; } .fh-t { display: none; } }
        .ctl { display: flex; flex-direction: column; gap: 16px; padding: 14px; }
        .row { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
        .playb { min-width: 104px; justify-content: center; }
        .scrub { flex: 1; min-width: 180px; padding-top: 8px; }
        .lamsel { display: flex; align-items: center; gap: 8px; }
        .lk { font-family: var(--font-mono); color: var(--muted); }
        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
        .stats .stat { padding: 10px 12px; border-left: 1px solid var(--line); }
        .stats .stat:first-child { border-left: 0; padding-left: 0; }
        .stats .stat .v { font-size: clamp(18px, 2.2vw, 24px); }
        @media (max-width: 760px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .stats .stat:nth-child(3) { border-left: 0; padding-left: 0; }
          .stats .stat:nth-child(n + 3) { border-top: 1px solid var(--line); }
          .scrub { flex-basis: 100%; order: 3; }
        }
        .fig-cap { max-width: 860px; }
      `}</style>
    </div>
  );
}
