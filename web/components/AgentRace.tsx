"use client";
// Race replay: the measured per-task timeline of Pennywise vs Alan Code's Auto Router on the same 10 agent
// coding tasks (web/public/data/agent_bench.json, exported from eval/results). Real minutes, sped up.
import { useCallback, useEffect, useRef, useState } from "react";
import { useData, useReducedMotion } from "./Store";

type Task = { task: string; level: string; pennywise_min: number; pennywise_merged: boolean; alan_min: number; alan_merged: boolean };
type Bench = { tasks: number; speedup: number; scope: string; merged_means: string; pennywise: { minutes: number; merged: number }; alan: { minutes: number; merged: number; routed_to?: string[] }; per_task: Task[] };

const PLAY_SECONDS = 14; // the whole Alan timeline plays in this many seconds
const LVL: Record<string, string> = { easy: "E", medium: "M", hard: "H" };

function clock(min: number) {
  const s = Math.max(0, Math.round(min * 60));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function AgentRace() {
  const b = useData<Bench>("agent_bench.json");
  const reduced = useReducedMotion();
  const [t, setT] = useState(0); // simulated minutes elapsed
  const [playing, setPlaying] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const total = b ? Math.max(...["pennywise", "alan"].map((k) => b.per_task.reduce((a, x) => a + (k === "pennywise" ? x.pennywise_min : x.alan_min), 0))) : 1;

  const play = useCallback(() => {
    if (!b) return;
    if (reduced) {
      setT(total);
      return;
    }
    setPlaying(true);
    const t0 = performance.now();
    const step = (now: number) => {
      const sim = ((now - t0) / 1000 / PLAY_SECONDS) * total;
      setT(Math.min(sim, total));
      if (sim < total) requestAnimationFrame(step);
      else setPlaying(false);
    };
    requestAnimationFrame(step);
  }, [b, reduced, total]);

  useEffect(() => {
    const el = host.current;
    if (!el || !b) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        play();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [b, play]);

  if (!b) return <div className="panel" style={{ padding: 20, color: "var(--muted)" }}>Loading race data…</div>;

  const lanes = [
    { key: "pennywise", name: "Pennywise", sub: "auto + tool-call cascade", color: "var(--accent)", mins: b.per_task.map((x) => x.pennywise_min), ok: b.per_task.map((x) => x.pennywise_merged) },
    { key: "alan", name: "Alan Auto Router", sub: (b.alan.routed_to || []).join(", ") || "Alan Code", color: "#94a3b8", mins: b.per_task.map((x) => x.alan_min), ok: b.per_task.map((x) => x.alan_merged) },
  ];
  const pwTotal = lanes[0].mins.reduce((a, x) => a + x, 0);

  return (
    <figure className="race panel" ref={host}>
      <div className="fig-head">
        <span className="fig-id">REPLAY</span>
        <span className="hide-sm">head-to-head · {b.tasks} agent coding tasks · measured timings, sped up</span>
        <span className="sp" />
        <span className={`led ${playing ? "" : "off"}`} />
        <span className="clk mono">{clock(t)}</span>
      </div>
      <div className="body">
        {lanes.map((lane) => {
          let acc = 0;
          const done = lane.mins.filter((_, i) => lane.mins.slice(0, i + 1).reduce((a, x) => a + x, 0) <= t + 1e-9).length;
          const laneTotal = lane.mins.reduce((a, x) => a + x, 0);
          const finished = t >= laneTotal - 1e-9;
          return (
            <div key={lane.key} className="lane">
              <div className="who">
                <b style={{ color: lane.color }}>{lane.name}</b>
                <span>{lane.sub}</span>
              </div>
              <div className="track">
                {lane.mins.map((m, i) => {
                  const start = acc;
                  acc += m;
                  const frac = Math.min(1, Math.max(0, (t - start) / m));
                  const task = b.per_task[i];
                  return (
                    <div key={task.task} className="seg" style={{ width: `${(m / total) * 100}%` }} title={`${task.task} (${task.level}) · ${m.toFixed(1)} min`}>
                      <div className="fill" style={{ transform: `scaleX(${frac})`, background: lane.color }} />
                      {frac >= 1 && m / total > 0.028 && <span className="tick">{lane.ok[i] ? "✓" : "✗"}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="stat">
                <span className="n mono">{done}/{b.tasks}</span>
                <span className={`fin mono ${finished ? "on" : ""}`}>{finished ? `done · ${laneTotal.toFixed(1)} min` : "working…"}</span>
              </div>
            </div>
          );
        })}
        <div className="axis mono">
          {[0, 10, 20, 30].filter((x) => x < total).map((x) => (
            <span key={x} style={{ left: `calc(${(x / total) * 100}% )` }}>{x} min</span>
          ))}
          <span className="mark" style={{ left: `${(pwTotal / total) * 100}%`, opacity: t >= pwTotal ? 1 : 0 }}>Pennywise finished ↑</span>
        </div>
        <div className="foot">
          <p className="verdict">
            {t >= pwTotal ? (
              <>
                Pennywise merged all <b>{b.pennywise.merged}/{b.tasks}</b> in <b>{b.pennywise.minutes.toFixed(1)} min</b>; Alan&apos;s Auto Router needed{" "}
                <b>{b.alan.minutes.toFixed(1)} min</b> for the same {b.alan.merged}/{b.tasks}: <b className="big">{b.speedup.toFixed(1)}× faster</b>.
              </>
            ) : (
              <>Same {b.tasks} tasks, same tests, one run each. Watch who finishes first.</>
            )}
          </p>
          <button className="btn" onClick={() => { started.current = true; play(); }} disabled={playing}>↻ Replay</button>
        </div>
        <div className="legend mono">
          {b.per_task.map((x, i) => (
            <span key={x.task}><b>{i + 1}</b> {x.task} <em>{LVL[x.level]}</em></span>
          ))}
        </div>
      </div>
      <figcaption className="fig-cap cap">
        {b.scope} Merged = {b.merged_means}. Segment widths are each task&apos;s measured wall-clock time on a shared scale.
      </figcaption>
      <style jsx>{`
        .race { margin: 0; }
        .clk { color: var(--text); font-size: 13px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
        .body { padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 14px; }
        .lane { display: grid; grid-template-columns: 170px minmax(0, 1fr) 132px; gap: 14px; align-items: center; }
        .who { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
        .who span { font-family: var(--font-mono); font-size: 10.5px; color: var(--dim); letter-spacing: 0.04em; }
        .track { display: flex; height: 30px; gap: 2px; }
        .seg { position: relative; height: 100%; background: rgba(148, 163, 184, 0.07); border: 1px solid var(--line); border-radius: 2px; overflow: hidden; min-width: 3px; }
        .fill { position: absolute; inset: 0; transform-origin: 0 50%; opacity: 0.9; }
        .tick { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #06070a; font-weight: 700; }
        .stat { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
        .n { font-size: 18px; color: var(--text); font-variant-numeric: tabular-nums; }
        .fin { color: var(--dim); font-size: 11px; transition: color 0.3s; }
        .fin.on { color: var(--ok); }
        .axis { position: relative; height: 32px; margin-left: 184px; margin-right: 146px; font-size: 10px; color: var(--dim); }
        .axis span { position: absolute; top: 0; transform: translateX(-2px); white-space: nowrap; }
        .axis .mark { top: 16px; color: var(--accent); transform: translateX(-50%); transition: opacity 0.4s; }
        .foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 12px; }
        .verdict { margin: 0; font-size: 15px; color: var(--muted); max-width: 760px; }
        .verdict b { color: var(--text); font-family: var(--font-mono); font-weight: 500; }
        .verdict .big { color: var(--accent); }
        .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 10.5px; color: var(--dim); }
        .legend b { color: var(--muted); font-weight: 500; margin-right: 2px; }
        .legend em { font-style: normal; color: var(--dim); border: 1px solid var(--line); border-radius: 2px; padding: 0 3px; margin-left: 2px; }
        .cap { margin: 0; padding: 10px 16px 14px; border-top: 1px solid var(--line); }
        @media (max-width: 760px) {
          .lane { grid-template-columns: 1fr; gap: 6px; }
          .stat { flex-direction: row; gap: 10px; align-items: baseline; }
          .axis { margin: 0; }
          .hide-sm { display: none; }
        }
      `}</style>
    </figure>
  );
}
