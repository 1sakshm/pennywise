"use client";
import * as d3 from "d3";
import { animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { pct, type ParetoPoint } from "@/lib/data";
import { CountUp } from "./fx";
import { Range, useSize, useVisible } from "./galaxy/instrument";
import { useData, useReducedMotion, useStore } from "./Store";

type Emb = "Laya-emb" | "MiniLM-emb";
type XMode = "log" | "lin";
type Lbl = { id: string; text: string; x: number; y: number; r: number; color: string };
type Placed = { id: string; text: string; x0: number; y0: number; w: number; h: number; ax: number; ay: number; color: string };

const EASE = [0.2, 0.8, 0.2, 1] as const;
const CHAR = 6.05; // Geist Mono advance at 10px
const fmtPct1 = (v: number) => pct(v);
const fmtPct0 = (v: number) => pct(v, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const markerColor = (p: ParetoPoint) =>
  p.name.startsWith("always-") ? `var(--${p.name.slice(7)})` : p.kind === "oracle" ? "var(--text)" : p.kind === "laya" ? "#cbd5e1" : "var(--muted)";
const short = (p: ParetoPoint) =>
  p.kind === "oracle" ? "oracle (hindsight)" : p.kind === "embedding" ? p.name.replace(/\s*\(.*\)/, "") + " (emb)" : p.name;
const fullName = (p: ParetoPoint) => p.name + (p.lambda != null ? ` · λ=${p.lambda}` : "");

/** Greedy direct-label placement: 8 directions × growing radius, avoiding other labels, markers and curve samples. */
function placeLabels(labels: Lbl[], obstacles: { x: number; y: number; r: number }[], bx: [number, number, number, number]): Placed[] {
  const placed: Placed[] = [];
  const dirs: [number, number][] = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
  const hit = (x0: number, y0: number, w: number, h: number) => {
    if (x0 < bx[0] || y0 < bx[1] || x0 + w > bx[2] || y0 + h > bx[3]) return true;
    for (const p of placed) if (x0 < p.x0 + p.w + 3 && x0 + w + 3 > p.x0 && y0 < p.y0 + p.h + 2 && y0 + h + 2 > p.y0) return true;
    for (const o of obstacles) {
      const cx = Math.max(x0, Math.min(o.x, x0 + w)), cy = Math.max(y0, Math.min(o.y, y0 + h));
      if ((cx - o.x) ** 2 + (cy - o.y) ** 2 < (o.r + 1.5) ** 2) return true;
    }
    return false;
  };
  for (const L of labels) {
    const w = L.text.length * CHAR + 6, h = 13;
    let best: Placed | null = null;
    outer: for (const dist of [7, 14, 24, 36, 52]) {
      for (const [ax, ay] of dirs) {
        const k = ax && ay ? 0.72 : 1;
        const cx = L.x + ax * (L.r + dist) * k, cy = L.y + ay * (L.r + dist) * k;
        const x0 = ax > 0 ? cx : ax < 0 ? cx - w : cx - w / 2;
        const y0 = ay > 0 ? cy : ay < 0 ? cy - h : cy - h / 2;
        if (!hit(x0, y0, w, h)) {
          best = { id: L.id, text: L.text, x0: x0 - L.x, y0: y0 - L.y, w, h, ax, ay, color: L.color };
          break outer;
        }
      }
    }
    if (best) placed.push({ ...best, x0: best.x0 + L.x, y0: best.y0 + L.y });
  }
  // store offsets relative to the anchor so labels can follow animated anchors
  return placed.map((p) => {
    const L = labels.find((l) => l.id === p.id)!;
    return { ...p, x0: p.x0 - L.x, y0: p.y0 - L.y };
  });
}

function Marker({ p, x, y }: { p: ParetoPoint; x: number; y: number }) {
  const c = markerColor(p);
  if (p.kind === "oracle") return <circle cx={x} cy={y} r={5.5} fill="var(--panel)" stroke={c} strokeDasharray="2 2" />;
  if (p.name === "random") return <path d={`M${x - 3.5},${y - 3.5}L${x + 3.5},${y + 3.5}M${x - 3.5},${y + 3.5}L${x + 3.5},${y - 3.5}`} stroke={c} strokeWidth="1.25" />;
  if (p.kind === "laya") return <path d={`M${x},${y - 5}L${x + 5},${y}L${x},${y + 5}L${x - 5},${y}Z`} fill="var(--panel)" stroke={c} strokeWidth="1.25" />;
  if (p.kind === "embedding") return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill="var(--panel)" stroke={c} strokeWidth="1.25" />;
  if (p.kind === "correctness-predictor") return <rect x={x - 2.5} y={y - 2.5} width={5} height={5} fill={c} />;
  return <circle cx={x} cy={y} r={4.5} fill={c} stroke="var(--panel)" strokeWidth="1.5" />;
}

export default function ParetoArena() {
  const pts = useData<ParetoPoint[]>("pareto.json");
  const { lambda, setLambda, manifest } = useStore();
  const reduce = useReducedMotion();
  const [emb, setEmb] = useState<Emb>("Laya-emb");
  const [xmode, setXmode] = useState<XMode>("log");
  const [setBox, size, box] = useSize<HTMLDivElement>();
  const seen = useVisible(box, true);
  const [hov, setHov] = useState<{ mx: number; my: number; p: ParetoPoint | null } | null>(null);

  const W = Math.max(280, Math.floor(size.w) || 720);
  const narrow = W < 520;
  const H = Math.round(Math.min(560, Math.max(300, W * (narrow ? 0.86 : 0.7))));
  const M = { l: narrow ? 40 : 50, r: narrow ? 10 : 18, t: 26, b: 42 };

  // x-scale blend 0 = linear, 1 = log (animated)
  const [tx, setTx] = useState(1);
  const txRef = useRef(1);
  useEffect(() => {
    const target = xmode === "log" ? 1 : 0;
    if (reduce) {
      txRef.current = target;
      setTx(target);
      return;
    }
    const c = animate(txRef.current, target, { duration: 0.85, ease: EASE, onUpdate: (v) => ((txRef.current = v), setTx(v)) });
    return () => c.stop();
  }, [xmode, reduce]);

  const d = useMemo(() => {
    if (!pts) return null;
    const rl = pts.filter((p) => p.kind === "rl").sort((a, b) => a.cost_vs_large - b.cost_vs_large);
    const ptl = pts.filter((p) => p.kind === "correctness-predictor" && p.name.includes(emb)).sort((a, b) => a.cost_vs_large - b.cost_vs_large);
    const fixed = pts.filter((p) => p.kind !== "rl" && p.kind !== "correctness-predictor" && (p.kind !== "embedding" || p.name.includes(emb)));
    const xmax = Math.max(1.05, d3.max(pts, (p) => p.cost_vs_large_ci[1])! * 1.02);
    const xmin = Math.max(1e-3, d3.min(pts, (p) => p.cost_vs_large_ci[0])! * 0.8);
    const lin = d3.scaleLinear().domain([0, xmax]).range([M.l, W - M.r]);
    const log = d3.scaleLog().domain([xmin, xmax * 1.08]).range([M.l, W - M.r]).clamp(true);
    const lo = d3.min(pts, (p) => p.accuracy_ci[0])!, hi = d3.max(pts, (p) => p.accuracy_ci[1])!;
    const y = d3.scaleLinear().domain([Math.max(0, lo - 0.03), Math.min(1, hi + 0.03)]).range([H - M.b, M.t]);
    return { rl, ptl, fixed, lin, log, y };
  }, [pts, emb, W, H, M.l, M.r, M.t, M.b]);

  // selected λ glides along the RL polyline (fractional index into the cost-sorted family)
  const selIdx = d ? Math.max(0, d.rl.findIndex((p) => p.lambda === lambda)) : 0;
  const [u, setU] = useState(selIdx);
  const uRef = useRef(selIdx);
  useEffect(() => {
    if (reduce || !seen) {
      uRef.current = selIdx;
      setU(selIdx);
      return;
    }
    const c = animate(uRef.current, selIdx, { duration: 0.75, ease: EASE, onUpdate: (v) => ((uRef.current = v), setU(v)) });
    return () => c.stop();
  }, [selIdx, reduce, seen]);

  // label layouts for both scale modes; offsets are interpolated with the scale blend
  const layouts = useMemo(() => {
    if (!d) return null;
    const make = (t: number) => {
      const X = (v: number) => lerp(d.lin(v), d.log(v), t);
      const obstacles: { x: number; y: number; r: number }[] = [];
      for (const p of [...d.fixed, ...d.rl, ...d.ptl]) obstacles.push({ x: X(p.cost_vs_large), y: d.y(p.accuracy), r: p.kind === "rl" ? 13 : 6 });
      for (const fam of [d.rl, d.ptl])
        for (let i = 1; i < fam.length; i++) {
          const ax = X(fam[i - 1].cost_vs_large), ay = d.y(fam[i - 1].accuracy), bx = X(fam[i].cost_vs_large), by = d.y(fam[i].accuracy);
          const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
          for (let k = 1; k < n; k++) obstacles.push({ x: lerp(ax, bx, k / n), y: lerp(ay, by, k / n), r: 2 });
        }
      const order = ["always-large", "always-small", "always-medium", "oracle", "zero-shot Laya", "SFT Laya", "random"];
      const fixedL: Lbl[] = d.fixed
        .slice()
        .sort((a, b) => (order.indexOf(a.name) + 99) % 99 - ((order.indexOf(b.name) + 99) % 99))
        .map((p) => ({ id: p.name, text: short(p), x: X(p.cost_vs_large), y: d.y(p.accuracy), r: 5, color: p.name.startsWith("always-") ? markerColor(p) : "var(--muted)" }));
      const rlTop = d.rl.reduce((a, b) => (b.accuracy > a.accuracy ? b : a), d.rl[0]);
      const ptlEnd = d.ptl[d.ptl.length - 1];
      const fam: Lbl[] = [
        ...(rlTop ? [{ id: "rl", text: "RL Laya · λ sweep", x: X(rlTop.cost_vs_large), y: d.y(rlTop.accuracy), r: 5, color: "var(--accent)" }] : []),
        ...(ptlEnd ? [{ id: "ptl", text: `per-tier LR · ${emb}`, x: X(ptlEnd.cost_vs_large), y: d.y(ptlEnd.accuracy), r: 4, color: "var(--muted)" }] : []),
      ];
      return placeLabels([...fam.slice(0, 1), ...fixedL.slice(0, 4), ...fam.slice(1), ...fixedL.slice(4)], obstacles, [M.l + 2, M.t - 4, W - M.r, H - M.b - 2]);
    };
    return { lin: make(0), log: make(1) };
  }, [d, emb, W, H, M.l, M.r, M.t, M.b]);

  if (!d || !manifest || !layouts) return <div className="panel" style={{ padding: 24, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>LOADING RESULTS…</div>;

  const X = (v: number) => lerp(d.lin(v), d.log(v), tx);
  const xs = tx >= 0.5 ? d.log : d.lin;
  const y = d.y;
  const sel = d.rl.find((p) => p.lambda === lambda) ?? d.rl[0];
  const lams = manifest.lambdas;
  const li = Math.max(0, lams.indexOf(lambda));
  const xTicks = (tx >= 0.5 ? [0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1].filter((t) => t >= d.log.domain()[0] && t <= d.log.domain()[1]) : d.lin.ticks(narrow ? 4 : 6));
  const yTicks = y.ticks(narrow ? 5 : 6);
  const yBase = H - M.b;

  const lineGen = d3.line<ParetoPoint>().x((p) => X(p.cost_vs_large)).y((p) => y(p.accuracy));
  const bandGen = d3.area<ParetoPoint>().x((p) => X(p.cost_vs_large)).y0((p) => y(p.accuracy_ci[0])).y1((p) => y(p.accuracy_ci[1]));
  const rlLine = lineGen(d.rl) ?? "";
  const rlBand = bandGen(d.rl) ?? "";
  const ptlLine = lineGen(d.ptl) ?? "";

  // interpolated selected point (position + CI) along the RL polyline
  const i0 = Math.max(0, Math.min(d.rl.length - 1, Math.floor(u))), i1 = Math.min(d.rl.length - 1, i0 + 1), f = u - i0;
  const A = d.rl[i0], B = d.rl[i1];
  const S = A && B && {
    x: lerp(X(A.cost_vs_large), X(B.cost_vs_large), f),
    y: lerp(y(A.accuracy), y(B.accuracy), f),
    ya: lerp(y(A.accuracy_ci[0]), y(B.accuracy_ci[0]), f),
    yb: lerp(y(A.accuracy_ci[1]), y(B.accuracy_ci[1]), f),
    xa: lerp(X(A.cost_vs_large_ci[0]), X(B.cost_vs_large_ci[0]), f),
    xb: lerp(X(A.cost_vs_large_ci[1]), X(B.cost_vs_large_ci[1]), f),
  };

  // labels: interpolate offsets between the linear and log layouts
  const anchors = new Map<string, { x: number; y: number }>();
  for (const p of d.fixed) anchors.set(p.name, { x: X(p.cost_vs_large), y: y(p.accuracy) });
  const rlTop = d.rl.reduce((a, b) => (b.accuracy > a.accuracy ? b : a), d.rl[0]);
  if (rlTop) anchors.set("rl", { x: X(rlTop.cost_vs_large), y: y(rlTop.accuracy) });
  const ptlEnd = d.ptl[d.ptl.length - 1];
  if (ptlEnd) anchors.set("ptl", { x: X(ptlEnd.cost_vs_large), y: y(ptlEnd.accuracy) });
  const labels = Array.from(new Set([...layouts.lin, ...layouts.log].map((l) => l.id))).flatMap((id) => {
    const a = layouts.lin.find((l) => l.id === id), b = layouts.log.find((l) => l.id === id), an = anchors.get(id);
    if (!an) return [];
    const base = (b ?? a)!;
    const ox = a && b ? lerp(a.x0, b.x0, tx) : base.x0, oy = a && b ? lerp(a.y0, b.y0, tx) : base.y0;
    const op = a && b ? 1 : b ? Math.max(0, tx * 2 - 1) : Math.max(0, 1 - tx * 2);
    const ax = a && b ? (tx >= 0.5 ? b.ax : a.ax) : base.ax, ay = a && b ? (tx >= 0.5 ? b.ay : a.ay) : base.ay;
    return [{ ...base, ax, ay, x0: an.x + ox, y0: an.y + oy, op, an }];
  });

  // hover: snap to nearest visible mark within 22px, else free crosshair
  const marks = [...d.fixed, ...d.rl, ...d.ptl];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H;
    if (mx < M.l || mx > W - M.r || my < M.t - 8 || my > yBase) return setHov(null);
    let best: ParetoPoint | null = null, bd = 22 * 22;
    for (const p of marks) {
      const dd = (X(p.cost_vs_large) - mx) ** 2 + (y(p.accuracy) - my) ** 2;
      if (dd < bd) (bd = dd), (best = p);
    }
    setHov({ mx, my, p: best });
  };
  const hp = hov?.p ?? null;
  const cx = hov ? (hp ? X(hp.cost_vs_large) : hov.mx) : 0;
  const cy = hov ? (hp ? y(hp.accuracy) : hov.my) : 0;
  const cxVal = hov ? (hp ? hp.cost_vs_large : xs.invert(cx)) : 0;
  const cyVal = hov ? (hp ? hp.accuracy : y.invert(cy)) : 0;
  const tipLeft = cx > W * 0.58;
  const lamLabel = (l: number) => (l === 0 ? "0" : String(l).replace(/^0\./, "."));

  return (
    <div className="pa">
      <div className="panel">
        <div className="fig-head">
          <span className="fig-id">FIG. 3</span>
          <span className="fh-t">
            PARETO ARENA<span className="fh-sub"> · TEST ACCURACY VS COST</span>
          </span>
          <span className="led" aria-hidden />
          <span className="sp" />
          <span className="fh-r">
            <span className="math">λ</span> = {lambda}
            <span className="fh-n"> · n = {manifest.n_test}</span>
          </span>
        </div>
        <div className="body">
          <div className="chart" ref={setBox}>
            <svg
              className={seen ? "on" : ""}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Test accuracy versus cost relative to always-large for every routing policy"
              onPointerMove={onMove}
              onPointerLeave={() => setHov(null)}
              onClick={() => hp?.kind === "rl" && hp.lambda != null && setLambda(hp.lambda)}
            >
              <defs>
                <clipPath id="pa-plot">
                  <rect x={M.l} y={M.t - 6} width={W - M.l - M.r} height={yBase - M.t + 6} />
                </clipPath>
              </defs>
              {/* grid + axes */}
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
                  <line x1={M.l - 4} x2={M.l} y1={y(t)} y2={y(t)} stroke="var(--line-2)" />
                  <text x={M.l - 7} y={y(t)} className="tk" textAnchor="end" dominantBaseline="middle">{pct(t, 0)}</text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={X(t)} x2={X(t)} y1={M.t} y2={yBase} stroke="var(--line)" strokeDasharray="2 4" />
                  <line x1={X(t)} x2={X(t)} y1={yBase} y2={yBase + 4} stroke="var(--line-2)" />
                  <text x={X(t)} y={yBase + 15} className="tk" textAnchor="middle">{pct(t, 0)}</text>
                </g>
              ))}
              <line x1={M.l} x2={W - M.r} y1={yBase} y2={yBase} stroke="var(--line-2)" />
              <line x1={M.l} x2={M.l} y1={M.t - 6} y2={yBase} stroke="var(--line-2)" />
              <text x={W - M.r} y={H - 6} className="ttl" textAnchor="end">
                {narrow ? "COST / ALWAYS-LARGE →" : "COST RELATIVE TO ALWAYS-LARGE →"}
                {tx >= 0.5 ? " (LOG)" : ""}
              </text>
              <text x={M.l - (narrow ? 34 : 44)} y={M.t - 14} className="ttl">TEST ACCURACY ↑</text>

              <g clipPath="url(#pa-plot)">
                {/* per-tier correctness LR sweep (strongest cheap baseline) */}
                <path d={ptlLine} className="fade d2" fill="none" stroke="var(--muted)" strokeWidth="1.25" strokeDasharray="5 4" />
                {d.ptl.map((p, i) => (
                  <g key={`ptl${p.lambda}`} className="pop" style={{ transitionDelay: `${0.9 + i * 0.04}s` }}>
                    <Marker p={p} x={X(p.cost_vs_large)} y={y(p.accuracy)} />
                  </g>
                ))}

                {/* RL family: CI band + line drawn in */}
                <path d={rlBand} className="fade d1" fill="var(--accent)" fillOpacity="0.1" />
                <path d={rlLine} className="draw" pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" />

                {/* fixed baselines with CI whiskers (4px caps) */}
                {d.fixed.map((p, i) => {
                  const px = X(p.cost_vs_large), py = y(p.accuracy), c = markerColor(p);
                  const ya = y(p.accuracy_ci[0]), yb = y(p.accuracy_ci[1]), xa = X(p.cost_vs_large_ci[0]), xb = X(p.cost_vs_large_ci[1]);
                  return (
                    <g key={p.name} className="pop" style={{ transitionDelay: `${0.25 + i * 0.05}s` }}>
                      <g stroke={c} strokeOpacity="0.55" strokeWidth="1">
                        <line x1={px} x2={px} y1={ya} y2={yb} />
                        <line x1={px - 4} x2={px + 4} y1={ya} y2={ya} />
                        <line x1={px - 4} x2={px + 4} y1={yb} y2={yb} />
                        {xb - xa > 2 && (
                          <>
                            <line x1={xa} x2={xb} y1={py} y2={py} />
                            <line x1={xa} x2={xa} y1={py - 4} y2={py + 4} />
                            <line x1={xb} x2={xb} y1={py - 4} y2={py + 4} />
                          </>
                        )}
                      </g>
                      <Marker p={p} x={px} y={py} />
                    </g>
                  );
                })}

                {/* RL points */}
                {d.rl.map((p, i) => (
                  <g key={`rl${p.lambda}`} className="pop" style={{ transitionDelay: `${0.6 + i * 0.05}s`, cursor: "pointer" }}>
                    <circle cx={X(p.cost_vs_large)} cy={y(p.accuracy)} r={3} fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.5" />
                  </g>
                ))}

                {/* selected λ: CI cross + reticle, gliding along the curve */}
                {S && (
                  <g className="fade d3">
                    <g stroke="var(--accent)" strokeWidth="1">
                      <line x1={S.x} x2={S.x} y1={S.ya} y2={S.yb} />
                      <line x1={S.x - 4} x2={S.x + 4} y1={S.ya} y2={S.ya} />
                      <line x1={S.x - 4} x2={S.x + 4} y1={S.yb} y2={S.yb} />
                      <line x1={S.xa} x2={S.xb} y1={S.y} y2={S.y} />
                      <line x1={S.xa} x2={S.xa} y1={S.y - 4} y2={S.y + 4} />
                      <line x1={S.xb} x2={S.xb} y1={S.y - 4} y2={S.y + 4} />
                    </g>
                    <g style={{ transform: `translate(${S.x}px, ${S.y}px)` }}>
                      <circle r={9} fill="none" stroke="var(--accent)" strokeWidth="1" />
                      <line x1={-13} x2={-9} y1={0} y2={0} stroke="var(--accent)" />
                      <line x1={9} x2={13} y1={0} y2={0} stroke="var(--accent)" />
                      <line x1={0} x2={0} y1={-13} y2={-9} stroke="var(--accent)" />
                      <line x1={0} x2={0} y1={9} y2={13} stroke="var(--accent)" />
                      <circle r={3.5} fill="var(--accent)" />
                    </g>
                  </g>
                )}
              </g>

              {/* direct labels with leader lines */}
              <g className="fade d3">
                {labels.map((l) => {
                  const ex = l.ax > 0 ? l.x0 : l.ax < 0 ? l.x0 + l.w : l.x0 + l.w / 2;
                  const ey = l.ay > 0 ? l.y0 : l.ay < 0 ? l.y0 + l.h : l.y0 + l.h / 2;
                  const len = Math.hypot(ex - l.an.x, ey - l.an.y) || 1;
                  const sx = l.an.x + ((ex - l.an.x) / len) * 6.5, sy = l.an.y + ((ey - l.an.y) / len) * 6.5;
                  return (
                    <g key={l.id} opacity={l.op}>
                      {len > 9 && <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--line-2)" />}
                      <text x={l.x0 + 3} y={l.y0 + l.h - 3.5} className="dl" fill={l.color}>{l.text}</text>
                    </g>
                  );
                })}
              </g>

              {/* crosshair */}
              {hov && (
                <g className="xh" pointerEvents="none">
                  <line x1={M.l} x2={W - M.r} y1={cy} y2={cy} stroke="var(--muted)" strokeOpacity=".45" strokeDasharray="3 3" />
                  <line x1={cx} x2={cx} y1={M.t - 6} y2={yBase} stroke="var(--muted)" strokeOpacity=".45" strokeDasharray="3 3" />
                  {hp && <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--text)" strokeWidth="1" />}
                  <g style={{ transform: `translate(${Math.min(Math.max(cx, M.l + 22), W - M.r - 22)}px, ${yBase}px)` }}>
                    <rect x={-22} y={2} width={44} height={14} rx={2} fill="var(--panel)" stroke="var(--line-2)" />
                    <text y={12.5} className="tk cur" textAnchor="middle">{pct(cxVal, 1)}</text>
                  </g>
                  <g style={{ transform: `translate(${M.l}px, ${cy}px)` }}>
                    <rect x={-(M.l - 2)} y={-7} width={M.l - 4} height={14} rx={2} fill="var(--panel)" stroke="var(--line-2)" />
                    <text x={-6} y={3.5} className="tk cur" textAnchor="end">{pct(cyVal, 1)}</text>
                  </g>
                </g>
              )}
            </svg>
            {hov && hp && (
              <div
                className="tip"
                style={{ transform: `translate(${tipLeft ? cx - 14 : cx + 14}px, ${Math.max(4, cy - 20)}px) translateX(${tipLeft ? "-100%" : "0"})` }}
              >
                <div className="tip-h">{fullName(hp)}</div>
                <div className="tr"><span>ACC</span><b>{pct(hp.accuracy)}</b><i>[{pct(hp.accuracy_ci[0])}, {pct(hp.accuracy_ci[1])}]</i></div>
                <div className="tr"><span>COST</span><b>{pct(hp.cost_vs_large, 1)}</b><i>[{pct(hp.cost_vs_large_ci[0], 1)}, {pct(hp.cost_vs_large_ci[1], 1)}]</i></div>
                {hp.router_latency_ms != null && hp.router_latency_ms > 0 && (
                  <div className="tr"><span>ROUTER</span><b>{hp.router_latency_ms.toFixed(1)} ms</b><i /></div>
                )}
                <div className="tr"><span>S/M/L</span><b>{hp.action_share.map((s) => pct(s, 0)).join(" / ")}</b><i /></div>
                {hp.kind === "rl" && hp.lambda !== lambda && <div className="tip-f">click to select</div>}
                {hp.kind === "oracle" && <div className="tip-f">uses hindsight — not achievable</div>}
              </div>
            )}
          </div>

          <aside className="side">
            <div className="blk">
              <div className="lbl">
                <span>COST / QUALITY KNOB</span>
                <span className="lv"><span className="math">λ</span> = {lambda}</span>
              </div>
              <Range
                id="lam"
                value={li}
                min={0}
                max={lams.length - 1}
                label="Lambda: cost / quality trade-off"
                onChange={(v) => setLambda(lams[v])}
                stops={lams.map((l, i) => ({ v: i, label: lamLabel(l) }))}
                ends={["← quality", "cheap →"]}
              />
            </div>
            {sel && (
              <div className="blk read">
                <div className="rd">
                  <span className="k">TEST ACCURACY</span>
                  <span className="v"><CountUp value={sel.accuracy} format={fmtPct1} duration={0.6} /></span>
                  <span className="ci">95% CI [{pct(sel.accuracy_ci[0])}, {pct(sel.accuracy_ci[1])}]</span>
                </div>
                <div className="rd">
                  <span className="k">COST / ALWAYS-LARGE</span>
                  <span className="v"><CountUp value={sel.cost_vs_large} format={fmtPct0} duration={0.6} /></span>
                  <span className="ci">95% CI [{pct(sel.cost_vs_large_ci[0], 1)}, {pct(sel.cost_vs_large_ci[1], 1)}]</span>
                </div>
                <div className="rd">
                  <span className="k">REQUESTS PER TIER</span>
                  <svg className="share" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden>
                    {(["small", "medium", "large"] as const).map((t, i) => {
                      const x0 = sel.action_share.slice(0, i).reduce((a, b) => a + b, 0) * 100;
                      return (
                        <rect key={t} x={0} y={0} width={100} height={8} fill={`var(--${t})`}
                          style={{ transform: `translateX(${x0}px) scaleX(${sel.action_share[i] || 0})`, transformOrigin: "0 0", transition: "transform .6s cubic-bezier(.2,.8,.2,1)" }} />
                      );
                    })}
                  </svg>
                  <div className="shk">
                    {(["small", "medium", "large"] as const).map((t, i) => (
                      <span key={t}><i className={`dot bg-${t}`} /> {t} <b>{pct(sel.action_share[i], 0)}</b></span>
                    ))}
                  </div>
                </div>
                <p className="note">Selecting <span className="math">λ</span> also drives the hero animation.</p>
              </div>
            )}
            <div className="blk ctlz">
              <div className="ctlrow">
                <span className="lbl1">BASELINE EMB.</span>
                <div className="seg" role="group" aria-label="Baseline embedding">
                  {(["Laya-emb", "MiniLM-emb"] as const).map((e) => (
                    <button key={e} aria-pressed={emb === e} onClick={() => setEmb(e)}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="ctlrow">
                <span className="lbl1">X AXIS</span>
                <div className="seg" role="group" aria-label="X axis scale">
                  {(["log", "lin"] as const).map((m) => (
                    <button key={m} aria-pressed={xmode === m} onClick={() => setXmode(m)}>{m === "log" ? "LOG" : "LINEAR"}</button>
                  ))}
                </div>
              </div>
              {manifest.jev && <div className="jev">JEV · {manifest.jev}</div>}
            </div>
          </aside>
        </div>
        <div className="key">
          <span><svg width="22" height="10"><rect x="0" y="2" width="22" height="6" fill="var(--accent)" fillOpacity=".13" /><line x1="0" x2="22" y1="5" y2="5" stroke="var(--accent)" strokeWidth="1.75" /></svg>RL Laya, 95% CI band</span>
          <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--muted)" strokeDasharray="5 4" /><rect x="8.5" y="2.5" width="5" height="5" fill="var(--muted)" /></svg>per-tier correctness LR</span>
          <span><svg width="12" height="12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="var(--muted)" /></svg>embedding LR / kNN</span>
          <span><svg width="12" height="12"><path d="M6 1L11 6L6 11L1 6Z" fill="none" stroke="#cbd5e1" /></svg>Laya, no RL</span>
          <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="var(--text)" strokeDasharray="2 2" /></svg>oracle</span>
        </div>
      </div>
      <p className="fig-cap">
        <b>Fig. 3 —</b> Accuracy on the {manifest.n_test} held-out test prompts against mean cost per request relative to always calling the large tier
        {tx >= 0.5 ? " (log scale)" : ""}. Whiskers and band are 95% confidence intervals. Yellow: one RL-trained Laya policy per <span className="math">λ</span>,
        joined in order of cost; the reticle marks the selected <span className="math">λ</span>. Dashed: per-tier correctness logistic regression on {emb} embeddings
        swept over the same <span className="math">λ</span> grid. The oracle routes with hindsight and is not achievable.
      </p>
      <style jsx>{`
        .pa { min-width: 0; }
        .fig-head > * { flex-shrink: 0; }
        .fh-t { flex-shrink: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .fh-r { white-space: nowrap; color: var(--text); font-variant-numeric: tabular-nums; }
        .fh-r .math, .lv .math { font-size: 14px; text-transform: none; }
        @media (max-width: 720px) { .fh-sub { display: none; } }
        @media (max-width: 420px) { .fh-n { display: none; } }
        .body { display: grid; grid-template-columns: minmax(0, 1fr) 272px; }
        .chart { position: relative; min-width: 0; padding: 14px 6px 6px 10px; }
        .chart svg { display: block; max-width: 100%; height: auto; touch-action: pan-y; user-select: none; }
        .chart :global(.tk) { font-family: var(--font-mono); font-size: 10px; fill: var(--dim); font-variant-numeric: tabular-nums; }
        .chart :global(.tk.cur) { fill: var(--text); }
        .chart :global(.ttl) { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.12em; fill: var(--muted); }
        .chart :global(.dl) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.02em; }
        /* entrance: draw the RL curve, fade bands, pop markers (opacity/transform/dashoffset only) */
        .chart :global(.draw) { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1.6s cubic-bezier(.65, 0, .35, 1) 0.2s; }
        .chart :global(.on .draw) { stroke-dashoffset: 0; }
        .chart :global(.fade) { opacity: 0; transition: opacity 0.9s var(--ease); }
        .chart :global(.fade.d1) { transition-delay: 0.9s; }
        .chart :global(.fade.d2) { transition-delay: 0.6s; }
        .chart :global(.fade.d3) { transition-delay: 1.3s; }
        .chart :global(.on .fade) { opacity: 1; }
        .chart :global(.pop) { opacity: 0; transform: translateY(6px); transform-box: fill-box; transition: opacity 0.6s var(--ease), transform 0.6s var(--ease); }
        .chart :global(.on .pop) { opacity: 1; transform: none; }
        .tip { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none; min-width: 210px; background: rgba(7, 8, 12, 0.96);
          border: 1px solid var(--line-2); border-radius: var(--radius); padding: 7px 10px; font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
        .tip-h { color: var(--text); padding-bottom: 5px; margin-bottom: 5px; border-bottom: 1px solid var(--line); white-space: nowrap; }
        .tr { display: grid; grid-template-columns: 52px auto 1fr; gap: 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tr span { color: var(--dim); font-size: 10px; letter-spacing: 0.08em; line-height: 18px; }
        .tr b { color: var(--text); font-weight: 400; }
        .tr i { font-style: normal; color: var(--dim); text-align: right; }
        .tip-f { margin-top: 5px; color: var(--accent); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
        .side { border-left: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0; }
        .blk { padding: 14px; border-bottom: 1px solid var(--line); }
        .blk:last-child { border-bottom: 0; }
        .lbl { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 8px; }
        .lv { color: var(--accent); letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
        .read { display: flex; flex-direction: column; gap: 14px; }
        .rd { display: flex; flex-direction: column; gap: 3px; }
        .rd .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--dim); }
        .rd .v { font-family: var(--font-mono); font-size: 26px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.15; }
        .rd .ci { font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .share { display: block; width: 100%; height: 8px; margin-top: 4px; outline: 1px solid var(--line-2); outline-offset: 2px; border-radius: 1px; }
        .shk { display: flex; justify-content: space-between; gap: 6px; margin-top: 8px; font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }
        .shk span { display: inline-flex; align-items: center; gap: 5px; }
        .shk b { color: var(--text); font-weight: 400; font-variant-numeric: tabular-nums; }
        .shk .dot { width: 6px; height: 6px; }
        .note { margin: 0; font-size: 12px; color: var(--dim); }
        .ctlz { display: flex; flex-direction: column; gap: 10px; }
        .ctlrow { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
        .ctlrow .seg { flex-wrap: nowrap; }
        .lbl1 { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; color: var(--dim); white-space: nowrap; }
        .jev { font-family: var(--font-mono); font-size: 10.5px; color: var(--dim); }
        .key { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 9px 14px; border-top: 1px solid var(--line); font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }
        .key span { display: inline-flex; align-items: center; gap: 7px; }
        .fig-cap { max-width: 860px; }
        @media (max-width: 900px) {
          .body { grid-template-columns: 1fr; }
          .side { border-left: 0; border-top: 1px solid var(--line); }
          .read { display: grid; grid-template-columns: 1fr 1fr; }
          .read .rd:nth-child(3), .read .note { grid-column: 1 / -1; }
        }
        @media (max-width: 420px) { .chart { padding: 10px 2px 4px 4px; } .rd .v { font-size: 22px; } }
      `}</style>
    </div>
  );
}
