"use client";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { route, streamAnswer } from "@/lib/api";
import { pct, TIERS, usd, type FallbackExample, type Tier } from "@/lib/data";
import { siteUrl } from "./BeatTheRouter";
import Integrate from "./Integrate";
import { useData, useStore } from "./Store";

type Run = {
  prompt: string;
  probs: Record<Tier, number> | null;
  action: Tier | null;
  ms: number | null;
  answer: string;
  cost: number | null;
  largeCost: number | null;
  recorded: boolean;
  stage: "routing" | "answering" | "done";
};

const EXAMPLES = [
  "What is the capital of Australia?",
  "Write a Python function that checks whether a string is a valid IPv4 address.",
  "A tank fills in 6 hours with pipe A and 9 hours with pipe B. Pipe C empties it in 12 hours. With all three open, how long to fill it?",
  "This test fails with IndexError: list index out of range in `for i in range(len(xs)+1)`. What kind of bug is it?",
];

export default function LiveMode() {
  const { live, lambda, refreshHealth } = useStore();
  const fallback = useData<FallbackExample[]>("demo_fallback.json");
  const [text, setText] = useState(EXAMPLES[1]);
  const [run, setRun] = useState<Run | null>(null);
  const [forcedFallback, setForcedFallback] = useState<string | null>(null);
  const [fbIdx, setFbIdx] = useState(0);
  const busy = run != null && run.stage !== "done";
  const useFallback = live === "fallback" || forcedFallback != null;
  const replayTimer = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => replayTimer.current.forEach(clearTimeout), []);

  const replay = (i: number) => {
    if (!fallback?.length) return;
    const ex = fallback[i % fallback.length];
    setFbIdx(i % fallback.length);
    replayTimer.current.forEach(clearTimeout);
    setRun({ prompt: ex.prompt, probs: null, action: null, ms: null, answer: "", cost: null, largeCost: null, recorded: true, stage: "routing" });
    const T = (f: () => void, ms: number) => replayTimer.current.push(setTimeout(f, ms));
    T(() => setRun((r) => r && { ...r, probs: ex.probs, action: ex.action, ms: ex.router_latency_ms, stage: "answering" }), 450);
    const words = ex.answer.split(/(\s+)/);
    words.forEach((_, k) => T(() => setRun((r) => r && { ...r, answer: words.slice(0, k + 1).join("") }), 900 + k * 18));
    T(() => setRun((r) => r && { ...r, cost: ex.cost_usd, largeCost: ex.large_cost_usd, stage: "done" }), 900 + words.length * 18 + 100);
  };

  const go = async () => {
    if (useFallback) return replay(fbIdx + 1);
    const prompt = text.trim();
    if (!prompt) return;
    setRun({ prompt, probs: null, action: null, ms: null, answer: "", cost: null, largeCost: null, recorded: false, stage: "routing" });
    const r = await route(prompt, lambda);
    if ("error" in r) {
      setForcedFallback(r.error);
      refreshHealth();
      return replay(0);
    }
    setRun((x) => x && { ...x, probs: r.probs, action: r.action, ms: r.router_latency_ms, stage: "answering" });
    const done = await streamAnswer(prompt, r.action, (d) => setRun((x) => x && { ...x, answer: x.answer + d }));
    if ("error" in done) {
      setRun((x) => x && { ...x, answer: x.answer || "(The model call failed — the routing decision above is still real.)", stage: "done" });
      return;
    }
    setRun((x) => x && { ...x, cost: done.cost_usd, largeCost: done.large_cost_usd, stage: "done" });
  };

  const shareHref = (r: Run) => {
    const saved = r.cost != null && r.largeCost != null ? Math.max(0, r.largeCost - r.cost) : 0;
    const q = new URLSearchParams({
      tier: r.action!,
      ms: String(Math.round(r.ms!)),
      conf: String(Math.round(100 * r.probs![r.action!])),
      saved: saved.toFixed(6),
      p: r.prompt.slice(0, 120),
    });
    const url = `${siteUrl()}/share/decision?${q}`;
    const t = `Laya routed this to ${r.action!.toUpperCase()} in ${Math.round(r.ms!)} ms at ${Math.round(100 * r.probs![r.action!])}% confidence. An open decision model, trained with RL to pick the cheapest LLM that gets it right.`;
    return `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(url)}`;
  };

  return (
    <div className="lm">
      <div className="panel main">
        <div className="head">
          <span className="eyebrow">live mode · λ = {lambda}</span>
          {useFallback ? (
            <span className="badge-fallback">Showing recorded runs — live server unavailable</span>
          ) : live === "checking" ? (
            <span className="chip">connecting…</span>
          ) : (
            <span className="chip" style={{ color: "var(--ok)" }}>● live</span>
          )}
        </div>
        {useFallback ? (
          <pre className="ro">{run?.prompt ?? fallback?.[fbIdx]?.prompt ?? "Recorded examples unavailable."}</pre>
        ) : (
          <>
            <textarea rows={4} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} aria-label="Your prompt" />
            <div className="ex">
              {EXAMPLES.map((e) => (
                <button key={e} className="chip" onClick={() => setText(e)}>
                  {e.slice(0, 38)}…
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button className="btn primary" onClick={go} disabled={busy || (useFallback && !fallback?.length)}>
            {useFallback ? (run ? "Replay next recorded run" : "Replay a recorded run") : busy ? "Routing…" : "Route it"}
          </button>
          {run?.ms != null && <span className="chip">router {run.ms.toFixed(0)} ms</span>}
          {run?.recorded && <span className="chip">recorded run</span>}
        </div>

        <div className="bars">
          {TIERS.map((t) => {
            const p = run?.probs?.[t] ?? 0;
            const chosen = run?.action === t;
            return (
              <div key={t} className={`bar ${chosen ? "chosen" : ""}`}>
                <span className={`tier-${t} name`}>{t}</span>
                <div className={run?.stage === "routing" ? "track shimmer" : "track"}>
                  <motion.div className={`fill bg-${t}`} initial={{ width: 0 }} animate={{ width: `${100 * p}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
                </div>
                <span className="mono p">{run?.probs ? pct(p, 0) : "—"}</span>
              </div>
            );
          })}
        </div>

        {run && run.stage !== "routing" && (
          <div className="answer">
            <div className="eyebrow">
              answer from <span className={`tier-${run.action}`}>{run.action}</span>
            </div>
            <div className="txt">{run.answer || "…"}</div>
          </div>
        )}
        {run?.stage === "done" && run.cost != null && run.largeCost != null && (
          <motion.div className="cost" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="stat"><span className="v">{usd(run.cost)}</span><span className="k">this request</span></div>
            <div className="stat"><span className="v">{usd(run.largeCost)}</span><span className="k">same tokens on large</span></div>
            <div className="stat"><span className="v" style={{ color: "var(--accent)" }}>{usd(Math.max(0, run.largeCost - run.cost))}</span><span className="k">saved</span></div>
            <a className="btn" href={shareHref(run)} target="_blank" rel="noreferrer">Share this decision</a>
          </motion.div>
        )}
      </div>
      <Integrate />
      <style jsx>{`
        .lm { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
        .main { padding: clamp(16px, 2.6vw, 24px); display: flex; flex-direction: column; gap: 14px; }
        .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ro { white-space: pre-wrap; margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: #070910; font-size: 14px; min-height: 90px; }
        .ex { display: flex; flex-wrap: wrap; gap: 6px; }
        .ex .chip { cursor: pointer; background: transparent; }
        .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .bars { display: flex; flex-direction: column; gap: 8px; }
        .bar { display: grid; grid-template-columns: 70px 1fr 46px; gap: 10px; align-items: center; opacity: 0.75; }
        .bar.chosen { opacity: 1; }
        .name { font-family: var(--font-mono); text-transform: uppercase; font-size: 13px; letter-spacing: 0.08em; }
        .track { height: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; overflow: hidden; }
        .lm :global(.fill) { height: 100%; border-radius: 6px; }
        .p { text-align: right; font-size: 13px; }
        .answer { border-top: 1px solid var(--line); padding-top: 12px; }
        .txt { white-space: pre-wrap; font-size: 14px; max-height: 260px; overflow: auto; margin-top: 6px; }
        .lm :global(.cost) { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 12px; }
        @media (max-width: 960px) { .lm { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
