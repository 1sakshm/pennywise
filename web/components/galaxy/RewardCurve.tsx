"use client";
import * as d3 from "d3";
import { useId, useMemo } from "react";
import type { Checkpoint } from "@/lib/data";
import { useSize } from "./instrument";

// Mini chart: validation reward (solid) and train reward moving average (dashed) per checkpoint,
// with a cursor that glides to the current checkpoint.
export default function RewardCurve({ cks, idx, height = 140 }: { cks: Checkpoint[]; idx: number; height?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(260, size.w || 600), H = height;
  const narrow = W < 480;
  const m = { l: 44, r: narrow ? 12 : 64, t: 20, b: 26 };
  const g = useMemo(() => {
    const steps = cks.map((c) => c.step);
    const vals = cks.flatMap((c) => [c.val.reward, c.train_reward_ma ?? c.val.reward]);
    const x = d3.scaleLinear().domain(d3.extent(steps) as [number, number]).range([m.l, W - m.r]);
    const lo = d3.min(vals)!, hi = d3.max(vals)!;
    const span = hi - lo || 1;
    const y = d3.scaleLinear().domain([lo - span * 0.12, hi + span * 0.12]).range([H - m.b, m.t]).nice(3);
    const line = d3.line<Checkpoint>().x((c) => x(c.step));
    const trainCks = cks.filter((c) => c.train_reward_ma != null);
    return {
      x,
      y,
      val: line.y((c) => y(c.val.reward))(cks)!,
      train: trainCks.length > 1 ? line.y((c) => y(c.train_reward_ma!))(trainCks)! : null,
      lastVal: cks[cks.length - 1],
      lastTrain: trainCks[trainCks.length - 1],
      xt: x.ticks(narrow ? 4 : 6).filter((t) => Number.isInteger(t)),
      yt: y.ticks(3),
    };
  }, [cks, W, H, m.l, m.r, m.t, m.b, narrow]);
  const c = cks[Math.min(idx, cks.length - 1)];
  const cx = g.x(c.step), cy = g.y(c.val.reward);
  const ease = "transform .45s cubic-bezier(.2,.8,.2,1)";
  const clipId = "rc" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div ref={ref} className="rc">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reward over training steps" style={{ display: "block", maxWidth: "100%" }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={W} height={H} style={{ transform: `translateX(${cx - W}px)`, transition: ease }} />
          </clipPath>
        </defs>
        {g.yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={m.l} x2={W - m.r} y1={g.y(t)} y2={g.y(t)} stroke="var(--line)" strokeDasharray="2 4" />
            <line x1={m.l - 4} x2={m.l} y1={g.y(t)} y2={g.y(t)} stroke="var(--line-2)" />
            <text x={m.l - 7} y={g.y(t)} className="tk" textAnchor="end" dominantBaseline="middle">{t.toFixed(2)}</text>
          </g>
        ))}
        {g.xt.map((t) => (
          <g key={`x${t}`}>
            <line x1={g.x(t)} x2={g.x(t)} y1={H - m.b} y2={H - m.b + 4} stroke="var(--line-2)" />
            <text x={g.x(t)} y={H - m.b + 15} className="tk" textAnchor="middle">{t}</text>
          </g>
        ))}
        <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="var(--line-2)" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} stroke="var(--line-2)" />
        <text x={m.l} y={m.t - 9} className="ttl">REWARD</text>
        <text x={W - m.r} y={H - 2} className="ttl" textAnchor="end">STEP →</text>

        {g.train && <path d={g.train} fill="none" stroke="var(--muted)" strokeOpacity=".7" strokeWidth="1" strokeDasharray="3 3" />}
        <path d={g.val} fill="none" stroke="var(--accent)" strokeOpacity=".25" strokeWidth="1.25" />
        <path d={g.val} fill="none" stroke="var(--accent)" strokeWidth="1.5" clipPath={`url(#${clipId})`} />
        {cks.map((k) => (
          <circle key={k.step} cx={g.x(k.step)} cy={g.y(k.val.reward)} r={1.75} fill={k.step <= c.step ? "var(--accent)" : "var(--dim)"} />
        ))}
        {!narrow && (
          <>
            <text x={W - m.r + 6} y={g.y(g.lastVal.val.reward)} className="dl" fill="var(--accent)" dominantBaseline="middle">VAL</text>
            {g.train && g.lastTrain && (
              <text x={W - m.r + 6} y={g.y(g.lastTrain.train_reward_ma!) + (Math.abs(g.y(g.lastTrain.train_reward_ma!) - g.y(g.lastVal.val.reward)) < 11 ? 11 : 0)} className="dl" fill="var(--muted)" dominantBaseline="middle">
                TRAIN MA
              </text>
            )}
          </>
        )}

        {/* cursor */}
        <g style={{ transform: `translateX(${cx}px)`, transition: ease }}>
          <line x1={0} x2={0} y1={m.t} y2={H - m.b} stroke="var(--text)" strokeOpacity=".45" />
          <rect x={-16} y={H - m.b + 4} width={32} height={13} rx={2} fill="var(--panel)" stroke="var(--line-2)" />
          <text x={0} y={H - m.b + 13.5} className="tk cur" textAnchor="middle">{c.step}</text>
        </g>
        <g style={{ transform: `translate(${cx}px, ${cy}px)`, transition: ease }}>
          <circle r={3.5} fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.5" />
        </g>
      </svg>
      {narrow && (
        <div className="rc-key">
          <span><i className="k-val" /> val reward</span>
          <span><i className="k-tr" /> train reward (moving avg)</span>
        </div>
      )}
      <style jsx>{`
        .rc { width: 100%; min-width: 0; }
        .rc :global(.tk) { font-family: var(--font-mono); font-size: 10px; fill: var(--dim); font-variant-numeric: tabular-nums; }
        .rc :global(.tk.cur) { fill: var(--text); }
        .rc :global(.ttl) { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.12em; fill: var(--dim); }
        .rc :global(.dl) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; }
        .rc-key { display: flex; gap: 14px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
        .rc-key span { display: inline-flex; align-items: center; gap: 6px; }
        .rc-key i { display: inline-block; width: 14px; height: 0; border-top: 1.5px solid var(--accent); }
        .rc-key i.k-tr { border-top: 1px dashed var(--muted); }
      `}</style>
    </div>
  );
}
