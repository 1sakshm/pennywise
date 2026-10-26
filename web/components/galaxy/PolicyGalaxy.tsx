"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { pct, SOURCE_LABEL, TIERS, type Training, type Umap } from "@/lib/data";
import { useData, useIsMobile, useReducedMotion, useStore } from "../Store";
import BrainMap2D from "./BrainMap2D";
import RewardCurve from "./RewardCurve";

const Galaxy3D = dynamic(() => import("./Galaxy3D"), { ssr: false });

type Props = { capture?: boolean; lambdaOverride?: number; stepMs?: number };

export default function PolicyGalaxy({ capture = false, lambdaOverride, stepMs = 450 }: Props) {
  const { manifest } = useStore();
  const umap = useData<Umap>("umap.json");
  const [lam, setLam] = useState<number | null>(null);
  const L = lambdaOverride ?? lam ?? manifest?.modes.auto ?? null;
  const training = useData<Training>(L == null ? "manifest.json" : `training/${+L.toFixed(4)}.json`);
  const cks = training && "checkpoints" in training ? training.checkpoints : null;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const [lowFps, setLowFps] = useState(false);
  const [force, setForce] = useState<"2d" | "3d" | null>(null);
  const use2D = force ? force === "2d" : mobile || reduced || lowFps;
  const viewRef = useRef<HTMLDivElement>(null);
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

  if (!umap || !cks || !manifest) return <div className="gal-empty">Loading galaxy…</div>;
  const ck = cks[Math.min(idx, cks.length - 1)];
  const prevCk = idx > 0 ? cks[Math.min(idx - 1, cks.length - 1)] : null;
  const flipped = prevCk ? ck.action.reduce((a, v, i) => a + (v !== prevCk.action[i] ? 1 : 0), 0) : 0;
  const props = {
    umap,
    action: ck.action,
    prob: ck.prob,
    onHover: (i: number | null, x: number, y: number) => setHover(i == null ? null : { i, x, y }),
  };
  const h = hover;
  return (
    <div className={capture ? "gal capture" : "gal"}>
      <div className="view" id="galaxy-view" ref={viewRef}>
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
          <div className="tip" style={{ left: Math.min(h.x + 14, 9999), top: h.y + 14 }}>
            <div className="eyebrow">
              {SOURCE_LABEL[umap.source[h.i]] ?? umap.source[h.i]} · {umap.split[h.i]}
            </div>
            <div className="pv">{umap.preview[h.i]}…</div>
            <div>
              → <b className={`tier-${TIERS[ck.action[h.i]]}`}>{TIERS[ck.action[h.i]]}</b> at {pct(ck.prob[h.i], 0)} confidence
            </div>
          </div>
        )}
        <AnimatePresence>
          {playing && !capture && (
            <motion.div className="hud" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="eyebrow">training · λ={L}</div>
              <motion.div key={ck.step} className="hud-step" initial={{ opacity: 0.4, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                step {ck.step}
              </motion.div>
              <div className="hud-row"><span>val accuracy</span><b>{pct(ck.val.accuracy)}</b></div>
              <div className="hud-row"><span>cost vs large</span><b>{pct(ck.val.cost_vs_large, 0)}</b></div>
              <div className="hud-row"><span>prompts flipped</span><b>{flipped}</b></div>
              <div className="hud-bar"><motion.div animate={{ width: `${(100 * idx) / Math.max(1, cks.length - 1)}%` }} transition={{ ease: "linear", duration: 0.3 }} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="legend">
          {TIERS.map((t) => (
            <span key={t} className="chip">
              <span className={`dot bg-${t}`} /> {t}
            </span>
          ))}
          <span className="chip">size = confidence</span>
          {!capture && (
            <button className="chip" style={{ cursor: "pointer", background: "transparent" }} onClick={() => setForce(use2D ? "3d" : "2d")}>
              {use2D ? "2D view · switch to 3D" : "3D · switch to 2D"}
            </button>
          )}
        </div>
        {capture && (
          <div className="overlay">
            <div className="eyebrow">Laya learns to route LLM calls with RL · λ={L}</div>
            <div className="big">step {ck.step}</div>
            <div className="nums">
              val accuracy {pct(ck.val.accuracy)} · cost {pct(ck.val.cost_vs_large, 0)} of always-large
            </div>
            {idx === cks.length - 1 && (
              <div className="final">
                {pct(manifest.headline.accuracy)} accuracy at {pct(manifest.headline.cost_vs_large, 0)} of the cost — test set
              </div>
            )}
          </div>
        )}
      </div>
      {!capture && (
        <div className="ctl">
          <div className="row">
            <button className="btn" onClick={() => (idx >= cks.length - 1 ? (setIdx(0), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? "❚❚ Pause" : idx >= cks.length - 1 ? "↺ Replay training" : "▶ Play"}
            </button>
            <input
              type="range"
              min={0}
              max={cks.length - 1}
              value={idx}
              aria-label="Training checkpoint"
              onChange={(e) => {
                setPlaying(false);
                setIdx(+e.target.value);
              }}
            />
            <div className="seg" role="group" aria-label="Lambda">
              {manifest.lambdas.map((l) => (
                <button key={l} aria-pressed={l === L} onClick={() => setLam(l)}>
                  λ {l}
                </button>
              ))}
            </div>
          </div>
          <div className="row stats">
            <div className="stat"><span className="v">{ck.step}</span><span className="k">training step</span></div>
            <div className="stat"><span className="v">{pct(ck.val.accuracy)}</span><span className="k">val accuracy</span></div>
            <div className="stat"><span className="v">{pct(ck.val.cost_vs_large, 0)}</span><span className="k">val cost vs large</span></div>
            <div className="stat"><span className="v">{ck.val.reward.toFixed(3)}</span><span className="k">val reward</span></div>
          </div>
          <RewardCurve cks={cks} idx={idx} />
        </div>
      )}
      <style jsx>{`
        .gal { display: flex; flex-direction: column; gap: 14px; }
        .view { position: relative; height: clamp(360px, 60vw, 600px); border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); background: #05060a; }
        .capture .view { height: 100vh; border: 0; border-radius: 0; }
        .tip { position: absolute; max-width: 300px; pointer-events: none; background: rgba(5, 6, 10, 0.92); border: 1px solid var(--line-2); border-radius: 10px; padding: 10px 12px; font-size: 13px; z-index: 3; }
        .pv { color: var(--muted); margin: 4px 0 6px; }
        .legend { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
        .view :global(.hud) { position: absolute; right: 14px; top: 14px; width: 210px; padding: 12px 14px; border-radius: 12px; z-index: 4;
          background: rgba(5, 6, 10, 0.72); border: 1px solid var(--line-2); backdrop-filter: blur(8px); font-size: 13px; }
        .view :global(.hud-step) { font-family: var(--font-mono); font-size: 26px; color: var(--accent); margin: 2px 0 6px; }
        .view :global(.hud-row) { display: flex; justify-content: space-between; color: var(--muted); }
        .view :global(.hud-row b) { color: var(--text); font-family: var(--font-mono); font-weight: 500; }
        .view :global(.hud-bar) { height: 3px; background: var(--line); border-radius: 3px; margin-top: 10px; overflow: hidden; }
        .view :global(.hud-bar div) { height: 100%; background: var(--accent); }
        .ctl { display: flex; flex-direction: column; gap: 12px; }
        .row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .row input[type="range"] { flex: 1; min-width: 160px; }
        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        @media (max-width: 760px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .overlay { position: absolute; left: 5%; top: 6%; right: 5%; pointer-events: none; }
        .overlay .big { font-size: clamp(40px, 7vw, 96px); font-family: var(--font-mono); font-weight: 600; }
        .overlay .nums { font-size: clamp(16px, 2vw, 26px); color: var(--muted); }
        .overlay .final { margin-top: 18px; font-size: clamp(22px, 3.2vw, 44px); color: var(--accent); font-weight: 600; }
      `}</style>
      <style jsx global>{`
        .gal-empty { height: 400px; display: grid; place-items: center; color: var(--muted); border: 1px solid var(--line); border-radius: var(--radius); }
      `}</style>
    </div>
  );
}
