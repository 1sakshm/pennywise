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
const EX_LABEL = ["factual", "code", "math", "debug"];
const EASE = [0.2, 0.8, 0.2, 1] as const;

export default function LiveMode() {
  const { live, lambda, refreshHealth } = useStore();
  const fallback = useData<FallbackExample[]>("demo_fallback.json");
  const [text, setText] = useState(EXAMPLES[1]);
  const [run, setRun] = useState<Run | null>(null);
  const [forcedFallback, setForcedFallback] = useState<string | null>(null);
  const [fbIdx, setFbIdx] = useState(0);
  const busy = run != null && run.stage !== "done";
  const useFallback = live === "fallback" || forcedFallback != null;
  const noRecorded = useFallback && !fallback?.length;
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

  const saved = run?.cost != null && run.largeCost != null ? Math.max(0, run.largeCost - run.cost) : null;
  const stageLabel = !run ? "idle" : run.stage === "routing" ? "routing" : run.stage === "answering" ? "streaming" : "done";

  return (
    <div className="lm">
      <div className="panel main">
        <div className="fig-head">
          <span className="fig-id">LIVE</span>
          <span className="hide-sm">Router console</span>
          <span>
            <span className="math lam">λ</span> = {lambda}
          </span>
          <span className="sp" />
          {useFallback ? (
            <span className="badge-fallback">Showing recorded runs — live server unavailable</span>
          ) : live === "checking" ? (
            <>
              <span>connecting</span>
              <span className="led off" />
            </>
          ) : (
            <>
              <span style={{ color: "var(--ok)" }}>live</span>
              <span className="led" />
            </>
          )}
        </div>

        <div className="body">
          {/* ---- input console ---- */}
          <div className="console">
            <div className="c-head">
              <span>stdin</span>
              <span className="dimtxt">{useFallback ? "recorded prompt" : "prompt"}</span>
              <span className="sp" />
              {!useFallback && <span className="tab">{text.length}/4000</span>}
              {run?.recorded && <span className="tag">recorded run</span>}
            </div>
            {useFallback ? (
              noRecorded ? (
                <div className="empty">
                  <div className="empty-row">
                    <span className="led off" />
                    <span className="empty-t">No recorded runs in this build</span>
                  </div>
                  <p>
                    This is the static site: there is no live router behind it, and recorded runs (<code>demo_fallback.json</code>) are exported only after
                    the evaluation completes. Nothing below is simulated — the readout stays empty until there is a real decision to show.
                  </p>
                  <p className="dimtxt">
                    To route your own prompts, run the server locally and point <code>NEXT_PUBLIC_API_URL</code> at it — or call the proxy directly (right).
                  </p>
                </div>
              ) : (
                <pre className="ro">
                  <span className="sigil">›</span>
                  {run?.prompt ?? fallback?.[fbIdx]?.prompt}
                </pre>
              )
            ) : (
              <div className="ta-wrap">
                <span className="sigil abs" aria-hidden>›</span>
                <textarea
                  rows={4}
                  value={text}
                  maxLength={4000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) {
                      e.preventDefault();
                      go();
                    }
                  }}
                  aria-label="Your prompt"
                  spellCheck={false}
                />
                {!text && (
                  <span className="ph" aria-hidden>
                    <span className="caret" />
                    <span className="dimtxt"> type a request…</span>
                  </span>
                )}
              </div>
            )}
            {!useFallback && (
              <div className="ex">
                <span className="dimtxt">presets</span>
                {EXAMPLES.map((e, i) => (
                  <button key={e} className="exb" onClick={() => setText(e)} aria-pressed={text === e} title={e}>
                    {EX_LABEL[i]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="row">
            <button className={noRecorded ? "btn" : "btn primary"} onClick={go} disabled={busy || (useFallback && !fallback?.length)}>
              {useFallback ? (run ? "Replay next recorded run" : "Replay a recorded run") : busy ? "Routing…" : "Route it"} <span className="arrow">→</span>
            </button>
            {!useFallback && (
              <span className="hint">
                <span className="kbd">Ctrl</span> <span className="kbd">↵</span>
              </span>
            )}
            <span className="sp" />
            <span className={`stage st-${stageLabel}`}>
              <i /> {stageLabel}
            </span>
          </div>

          {/* ---- decision ---- */}
          <div className="scope">
            <div className="s-head">
              <span>
                Decision <span className="math pi">π(a|s)</span>
              </span>
              <span className="sp" />
              <span className="dimtxt">{run?.probs ? "softmax over tiers" : noRecorded ? "no data" : "awaiting input"}</span>
            </div>
            <div className="chart">
              <div className="grid" aria-hidden>
                {[0, 25, 50, 75, 100].map((g) => (
                  <span key={g} style={{ left: `${g}%` }} />
                ))}
              </div>
              {TIERS.map((t, i) => {
                const p = run?.probs?.[t] ?? 0;
                const chosen = run?.action === t;
                return (
                  <div key={t} className={`bar ${chosen ? "chosen" : ""} ${run?.probs && !chosen ? "dimmed" : ""}`}>
                    <span className={`tier-${t} name`}>{t}</span>
                    <div className="track">
                      {run?.stage === "routing" && <span className="scan" style={{ animationDelay: `${i * 0.15}s` }} />}
                      <motion.div
                        className={`fill bg-${t}`}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: p }}
                        transition={{ duration: 0.8, delay: 0.06 * i, ease: EASE }}
                      />
                    </div>
                    <span className="p tab">{run?.probs ? pct(p, 1) : "—"}</span>
                    <span className="arg">{chosen ? "◂ argmax" : ""}</span>
                  </div>
                );
              })}
              <div className="axis" aria-hidden>
                <span className="lbl-name" />
                <div className="ticks">
                  {[0, 0.25, 0.5, 0.75, 1].map((g) => (
                    <span key={g} style={{ left: `${g * 100}%` }}>
                      {g === 0 ? "0" : g === 1 ? "1" : String(g).slice(1)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="readouts">
              <div className="stat">
                <span className={`v ${run?.action ? `tier-${run.action}` : "nil"}`}>{run?.action ? run.action.toUpperCase() : "—"}</span>
                <span className="k">routed tier</span>
              </div>
              <div className="stat">
                <span className={`v ${run?.ms != null ? "" : "nil"}`}>{run?.ms != null ? `${run.ms.toFixed(0)} ms` : "—"}</span>
                <span className="k">router latency</span>
              </div>
              <div className="stat">
                <span className={`v ${saved != null ? "acc" : "nil"}`}>{saved != null ? usd(saved) : "—"}</span>
                <span className="k">saved vs large</span>
              </div>
            </div>
          </div>

          {/* ---- answer ---- */}
          {run && run.stage !== "routing" && (
            <motion.div className="answer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <div className="c-head">
                <span>stdout</span>
                <span className={`tier-${run.action}`}>{run.action}</span>
                <span className="sp" />
                <span className="tab">{run.answer.length} chars</span>
              </div>
              <div className="txt">
                {run.answer}
                {run.stage === "answering" && <span className="caret" />}
              </div>
            </motion.div>
          )}
          {run?.stage === "done" && run.cost != null && run.largeCost != null && (
            <motion.div className="cost" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <div className="stat"><span className="v">{usd(run.cost)}</span><span className="k">this request</span></div>
              <div className="stat"><span className="v">{usd(run.largeCost)}</span><span className="k">same tokens on large</span></div>
              <div className="stat"><span className="v" style={{ color: "var(--accent)" }}>{usd(Math.max(0, run.largeCost - run.cost))}</span><span className="k">saved</span></div>
              <a className="btn" href={shareHref(run)} target="_blank" rel="noreferrer">Share this decision</a>
            </motion.div>
          )}
        </div>
      </div>
      <Integrate />
      <style jsx>{`
        .lm { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
        .main { min-width: 0; }
        .main .fig-head { flex-wrap: wrap; row-gap: 6px; }
        .lam { font-size: 14px; text-transform: none; }
        .body { padding: clamp(14px, 2.4vw, 22px); display: flex; flex-direction: column; gap: 16px; }
        .sp { flex: 1; }
        .dimtxt { color: var(--dim); }
        .tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 6px; border-radius: 2px; border: 1px solid rgba(251, 191, 36, 0.35); color: #fbbf24; }
        code { font-family: var(--font-mono); font-size: 12px; color: var(--text); }

        .console { border: 1px solid var(--line-2); border-radius: var(--radius); background: #07080c; }
        .c-head { display: flex; gap: 10px; align-items: center; padding: 6px 12px; border-bottom: 1px dashed var(--line); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
        .ta-wrap { position: relative; }
        .ta-wrap textarea { display: block; border: 0; border-radius: 0; background: transparent; padding: 12px 14px 12px 30px; font-size: 13.5px; min-height: 104px; }
        .ta-wrap textarea:focus { outline: none; box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.45); }
        .sigil { color: var(--accent); font-family: var(--font-mono); margin-right: 10px; }
        .sigil.abs { position: absolute; left: 14px; top: 12px; font-size: 13.5px; line-height: 1.6; pointer-events: none; }
        .ph { position: absolute; left: 30px; top: 12px; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.6; pointer-events: none; }
        .ro { white-space: pre-wrap; word-break: break-word; margin: 0; padding: 12px 14px; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.6; min-height: 90px; }
        .ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; border-top: 1px dashed var(--line); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; }
        .ex .dimtxt { margin-right: 4px; }
        .exb { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em; text-transform: lowercase; padding: 2px 8px; border-radius: 3px; border: 1px solid var(--line-2); background: transparent; color: var(--muted); cursor: pointer; transition: color 0.2s, border-color 0.2s, background 0.2s; }
        .exb:hover { color: var(--text); border-color: rgba(232, 235, 241, 0.45); }
        .exb[aria-pressed="true"] { color: var(--text); background: rgba(232, 235, 241, 0.08); }

        .empty { padding: 16px 14px; display: flex; flex-direction: column; gap: 10px; background-image: repeating-linear-gradient(135deg, transparent 0 9px, rgba(148, 163, 184, 0.035) 9px 10px); }
        .empty-row { display: flex; gap: 10px; align-items: center; }
        .empty-t { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text); }
        .empty p { margin: 0; font-size: 13.5px; color: var(--muted); line-height: 1.6; }
        .empty p.dimtxt { font-size: 12.5px; color: var(--dim); }

        .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .hint { display: inline-flex; gap: 4px; }
        .stage { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); }
        .stage i { width: 6px; height: 6px; border-radius: 50%; background: var(--dim); }
        .st-routing, .st-streaming { color: var(--accent); }
        .st-routing i, .st-streaming i { background: var(--accent); animation: led 0.9s ease-in-out infinite; }
        .st-done { color: var(--ok); }
        .st-done i { background: var(--ok); }

        .scope { border: 1px solid var(--line); border-radius: var(--radius); }
        .s-head { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
        .pi { font-size: 14px; text-transform: none; color: var(--text); margin-left: 4px; }
        .chart { position: relative; padding: 16px 12px 6px; display: flex; flex-direction: column; gap: 10px; --name-w: 64px; --p-w: 52px; --arg-w: 64px; --gap: 10px; }
        .grid { position: absolute; top: 10px; bottom: 26px; left: calc(12px + var(--name-w) + var(--gap)); right: calc(12px + var(--p-w) + var(--arg-w) + 2 * var(--gap)); pointer-events: none; }
        .grid span { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--line); }
        .bar { position: relative; display: grid; grid-template-columns: var(--name-w) minmax(0, 1fr) var(--p-w) var(--arg-w); gap: var(--gap); align-items: center; transition: opacity 0.4s var(--ease); }
        .bar.dimmed { opacity: 0.55; }
        .name { font-family: var(--font-mono); text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; }
        .track { position: relative; height: 14px; background: rgba(148, 163, 184, 0.06); overflow: hidden; }
        .lm :global(.fill) { position: absolute; inset: 0; transform-origin: left; }
        .scan { position: absolute; top: 0; bottom: 0; width: 22%; background: linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.28), transparent); animation: scan 1.1s var(--ease) infinite; }
        @keyframes scan { from { transform: translateX(-100%); } to { transform: translateX(460%); } }
        .p { text-align: right; font-family: var(--font-mono); font-size: 12.5px; }
        .bar.chosen .p { color: var(--text); }
        .arg { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
        .axis { display: grid; grid-template-columns: var(--name-w) minmax(0, 1fr) var(--p-w) var(--arg-w); gap: var(--gap); height: 18px; }
        .ticks { position: relative; border-top: 1px solid var(--line-2); }
        .ticks span { position: absolute; top: 0; transform: translateX(-50%); padding-top: 5px; font-family: var(--font-mono); font-size: 10px; color: var(--dim); }
        .ticks span::before { content: ""; position: absolute; top: 0; left: 50%; height: 4px; border-left: 1px solid var(--line-2); }
        .readouts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); }
        .readouts .stat { padding: 12px; border-left: 1px solid var(--line); min-width: 0; }
        .readouts .stat:first-child { border-left: 0; }
        .readouts .v { font-size: clamp(16px, 1.8vw, 20px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v.nil { color: var(--dim); }
        .v.acc { color: var(--accent); }

        .lm :global(.answer) { border: 1px solid var(--line); border-radius: var(--radius); background: #07080c; }
        .txt { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.65; max-height: 260px; overflow: auto; padding: 12px 14px; color: var(--text); }
        .lm :global(.cost) { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 14px; }
        .lm :global(.cost .btn) { margin-left: auto; }
        @media (max-width: 960px) { .lm { grid-template-columns: 1fr; } }
        @media (max-width: 520px) {
          .hide-sm { display: none; }
          .chart { --name-w: 54px; --p-w: 46px; --arg-w: 0px; --gap: 8px; }
          .arg { display: none; }
          .hint { display: none; }
          .readouts .stat { padding: 10px; }
          .lm :global(.cost .btn) { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
