"use client";
import * as d3 from "d3";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { pct, type ParetoPoint } from "@/lib/data";
import { useData, useStore } from "./Store";

const W = 760, H = 440, M = { l: 56, r: 20, t: 20, b: 48 };

export default function ParetoArena() {
  const pts = useData<ParetoPoint[]>("pareto.json");
  const { lambda, setLambda, manifest } = useStore();
  const [emb, setEmb] = useState<"Laya-emb" | "MiniLM-emb">("Laya-emb");
  const [hover, setHover] = useState<ParetoPoint | null>(null);

  const d = useMemo(() => {
    if (!pts) return null;
    const rl = pts.filter((p) => p.kind === "rl").sort((a, b) => a.cost_vs_large - b.cost_vs_large);
    const ptl = pts.filter((p) => p.kind === "correctness-predictor" && p.name.includes(emb)).sort((a, b) => a.cost_vs_large - b.cost_vs_large);
    const fixed = pts.filter((p) => p.kind !== "rl" && p.kind !== "correctness-predictor");
    const all = pts;
    const x = d3.scaleLinear().domain([0, Math.max(1.05, d3.max(all, (p) => p.cost_vs_large_ci[1])! * 1.02)]).range([M.l, W - M.r]);
    const lo = d3.min(all, (p) => p.accuracy_ci[0])!, hi = d3.max(all, (p) => p.accuracy_ci[1])!;
    const y = d3.scaleLinear().domain([Math.max(0, lo - 0.03), Math.min(1, hi + 0.03)]).range([H - M.b, M.t]);
    const line = d3.line<ParetoPoint>().x((p) => x(p.cost_vs_large)).y((p) => y(p.accuracy)).curve(d3.curveMonotoneX);
    const band = d3
      .area<ParetoPoint>()
      .x((p) => x(p.cost_vs_large))
      .y0((p) => y(p.accuracy_ci[0]))
      .y1((p) => y(p.accuracy_ci[1]))
      .curve(d3.curveMonotoneX);
    return { rl, ptl, fixed, x, y, rlLine: line(rl)!, rlBand: band(rl)!, ptlLine: line(ptl)! };
  }, [pts, emb]);

  if (!d || !manifest) return <div className="panel" style={{ padding: 24, color: "var(--muted)" }}>Loading results…</div>;
  const sel = d.rl.find((p) => p.lambda === lambda) ?? d.rl[0];
  const lams = manifest.lambdas;
  const li = Math.max(0, lams.indexOf(lambda));
  const label = (p: ParetoPoint) => p.name + (p.lambda != null ? ` λ=${p.lambda}` : "");

  return (
    <div className="pa">
      <div className="panel chart">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Accuracy versus cost for every routing policy">
          {d.x.ticks(6).map((t) => (
            <g key={`x${t}`}>
              <line x1={d.x(t)} x2={d.x(t)} y1={M.t} y2={H - M.b} stroke="rgba(148,163,184,.08)" />
              <text x={d.x(t)} y={H - M.b + 18} fill="#8b93a7" fontSize="11" textAnchor="middle">{pct(t, 0)}</text>
            </g>
          ))}
          {d.y.ticks(6).map((t) => (
            <g key={`y${t}`}>
              <line x1={M.l} x2={W - M.r} y1={d.y(t)} y2={d.y(t)} stroke="rgba(148,163,184,.08)" />
              <text x={M.l - 8} y={d.y(t)} fill="#8b93a7" fontSize="11" textAnchor="end" dominantBaseline="middle">{pct(t, 0)}</text>
            </g>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 8} fill="#8b93a7" fontSize="12" textAnchor="middle">cost relative to always-large →</text>
          <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} fill="#8b93a7" fontSize="12" textAnchor="middle">accuracy →</text>

          <path d={d.ptlLine} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity=".7" />
          <motion.path d={d.rlBand} fill="#facc15" opacity={0.12} initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ duration: 1 }} />
          <motion.path d={d.rlLine} fill="none" stroke="#facc15" strokeWidth="2.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: "easeInOut" }} />

          {d.fixed.map((p) => (
            <g key={label(p)} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <line x1={d.x(p.cost_vs_large)} x2={d.x(p.cost_vs_large)} y1={d.y(p.accuracy_ci[0])} y2={d.y(p.accuracy_ci[1])} stroke="#64748b" />
              <circle
                cx={d.x(p.cost_vs_large)}
                cy={d.y(p.accuracy)}
                r={p.kind === "oracle" ? 6 : 4.5}
                fill={p.name.startsWith("always-") ? `var(--${p.name.slice(7)})` : p.kind === "oracle" ? "none" : "#94a3b8"}
                stroke={p.kind === "oracle" ? "#fff" : "none"}
                strokeDasharray={p.kind === "oracle" ? "2 2" : undefined}
              />
              {["always-small", "always-medium", "always-large", "oracle", "zero-shot Laya"].includes(p.name) && (
                <text x={d.x(p.cost_vs_large) + 8} y={d.y(p.accuracy) - 8} fill="#cbd5e1" fontSize="11">{p.name}</text>
              )}
            </g>
          ))}
          {d.rl.map((p) => (
            <circle key={p.lambda} cx={d.x(p.cost_vs_large)} cy={d.y(p.accuracy)} r={3.5} fill="#facc15" onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} />
          ))}
          {sel && (
            <motion.g animate={{ x: d.x(sel.cost_vs_large), y: d.y(sel.accuracy) }} transition={{ type: "spring", stiffness: 120, damping: 16 }}>
              <circle r="11" fill="none" stroke="#facc15" strokeWidth="2" />
              <circle r="5" fill="#fff" />
            </motion.g>
          )}
        </svg>
        <div className="legend">
          <span className="chip"><span className="dot" style={{ background: "#facc15" }} /> RL-trained Laya (λ family, 95% CI band)</span>
          <span className="chip"><span className="dot" style={{ background: "#94a3b8" }} /> per-tier correctness LR ({emb}) — strongest cheap baseline</span>
          <span className="chip">○ oracle (hindsight, not achievable)</span>
          {manifest.jev && <span className="chip">Jev: {manifest.jev}</span>}
        </div>
      </div>
      <div className="side">
        <label className="eyebrow" htmlFor="lam">
          cost / quality knob · λ = {lambda}
        </label>
        <input id="lam" type="range" min={0} max={lams.length - 1} step={1} value={li} onChange={(e) => setLambda(lams[+e.target.value])} />
        <div className="ticks">
          <span>quality</span>
          <span>cheap</span>
        </div>
        {sel && (
          <div className="sel">
            <div className="stat"><span className="v">{pct(sel.accuracy)}</span><span className="k">accuracy [{pct(sel.accuracy_ci[0])}, {pct(sel.accuracy_ci[1])}]</span></div>
            <div className="stat"><span className="v">{pct(sel.cost_vs_large, 0)}</span><span className="k">of always-large cost [{pct(sel.cost_vs_large_ci[0], 0)}, {pct(sel.cost_vs_large_ci[1], 0)}]</span></div>
            <div className="share">
              {(["small", "medium", "large"] as const).map((t, i) => (
                <div key={t} className={`bg-${t}`} style={{ flex: sel.action_share[i] || 0.0001 }} title={`${t} ${pct(sel.action_share[i], 0)}`} />
              ))}
            </div>
            <span className="k">share of requests per tier · moves the hero above too</span>
          </div>
        )}
        <div className="seg" role="group" aria-label="Baseline embedding">
          {(["Laya-emb", "MiniLM-emb"] as const).map((e) => (
            <button key={e} aria-pressed={emb === e} onClick={() => setEmb(e)}>
              baseline on {e}
            </button>
          ))}
        </div>
        {hover && (
          <div className="hov panel">
            <b>{label(hover)}</b>
            <div>accuracy {pct(hover.accuracy)} [{pct(hover.accuracy_ci[0])}, {pct(hover.accuracy_ci[1])}]</div>
            <div>cost {pct(hover.cost_vs_large, 0)} of always-large</div>
            {hover.router_latency_ms != null && <div>router {hover.router_latency_ms.toFixed(1)} ms</div>}
          </div>
        )}
      </div>
      <style jsx>{`
        .pa { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; }
        .chart { padding: 12px; }
        .legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 8px 6px; }
        .side { display: flex; flex-direction: column; gap: 14px; }
        .ticks { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: -8px; }
        .sel { display: flex; flex-direction: column; gap: 10px; }
        .share { display: flex; height: 8px; border-radius: 6px; overflow: hidden; gap: 2px; }
        .k { font-size: 12px; color: var(--muted); }
        .hov { padding: 10px 12px; font-size: 13px; }
        @media (max-width: 900px) { .pa { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
