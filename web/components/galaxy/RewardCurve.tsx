"use client";
import * as d3 from "d3";
import { useMemo } from "react";
import type { Checkpoint } from "@/lib/data";

export default function RewardCurve({ cks, idx, height = 120 }: { cks: Checkpoint[]; idx: number; height?: number }) {
  const W = 600, H = height, m = { l: 40, r: 10, t: 10, b: 22 };
  const { x, y, val, train } = useMemo(() => {
    const steps = cks.map((c) => c.step);
    const vals = cks.flatMap((c) => [c.val.reward, c.train_reward_ma ?? c.val.reward]);
    const x = d3.scaleLinear().domain(d3.extent(steps) as [number, number]).range([m.l, W - m.r]);
    const lo = d3.min(vals)!, hi = d3.max(vals)!;
    const y = d3.scaleLinear().domain([lo - (hi - lo) * 0.1, hi + (hi - lo) * 0.1 || 1]).range([H - m.b, m.t]);
    const line = d3.line<Checkpoint>().x((c) => x(c.step)).curve(d3.curveMonotoneX);
    return {
      x, y,
      val: line.y((c) => y(c.val.reward))(cks)!,
      train: line.y((c) => y(c.train_reward_ma ?? c.val.reward))(cks.filter((c) => c.train_reward_ma != null))!,
    };
  }, [cks, H, m.b, m.l, m.r, m.t]);
  const c = cks[Math.min(idx, cks.length - 1)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Reward over training steps">
      {y.ticks(3).map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="rgba(148,163,184,.12)" />
          <text x={m.l - 6} y={y(t)} fill="#5b6377" fontSize="10" textAnchor="end" dominantBaseline="middle">{t.toFixed(2)}</text>
        </g>
      ))}
      <path d={train} fill="none" stroke="rgba(148,163,184,.55)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d={val} fill="none" stroke="#facc15" strokeWidth="2" />
      <line x1={x(c.step)} x2={x(c.step)} y1={m.t} y2={H - m.b} stroke="#fff" strokeOpacity=".6" />
      <circle cx={x(c.step)} cy={y(c.val.reward)} r="4" fill="#facc15" />
      <text x={W - m.r} y={H - 6} fill="#5b6377" fontSize="10" textAnchor="end">step {c.step}</text>
      <text x={m.l + 4} y={H - 6} fill="#5b6377" fontSize="10">— val reward · - - train reward (moving avg)</text>
    </svg>
  );
}
