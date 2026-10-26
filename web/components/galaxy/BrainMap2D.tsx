"use client";
import { useEffect, useRef, useState } from "react";
import { TIER_RGB, TIERS } from "@/lib/data";
import type { GalaxyProps } from "./Galaxy3D";
import { useVisible } from "./instrument";

const PAD = 34;

// 2D fallback for the galaxy: same data, canvas 2D, colors tween between checkpoints.
export default function BrainMap2D({ umap, action, prob, onHover, animate = true }: GalaxyProps & { animate?: boolean }) {
  const [cvEl, setCvEl] = useState<HTMLCanvasElement | null>(null);
  const visible = useVisible(cvEl, false, "100px");
  const tgt = useRef<{ c: Float32Array; s: Float32Array } | null>(null);
  const cur = useRef<{ c: Float32Array; s: Float32Array } | null>(null);
  const hov = useRef(-1);
  const n = umap.xy.length;
  const prev = useRef<number[] | null>(null);
  // robust per-axis bounds (2nd-98th percentile) so a few outliers don't shrink the map
  const bounds = useRef<[number, number, number, number] | null>(null);
  if (!bounds.current) {
    const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
    const xs = umap.xy.map((p) => p[0]), ys = umap.xy.map((p) => p[1]);
    bounds.current = [q(xs, 0.02), q(xs, 0.98), q(ys, 0.02), q(ys, 0.98)];
  }
  const project = (x: number, y: number, w: number, h: number) => {
    const [x0, x1, y0, y1] = bounds.current!;
    return [PAD + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * PAD), h - PAD - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * PAD)];
  };

  useEffect(() => {
    const c = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = action ? action[i] : -1;
      c.set(a >= 0 ? TIER_RGB[TIERS[a]] : [0.55, 0.58, 0.65], i * 3);
      s[i] = (1.4 + 2.8 * (prob ? prob[i] : 0.5)) * (umap.split[i] === "test" ? 1.2 : 1);
    }
    tgt.current = { c, s };
    if (!cur.current || !animate) cur.current = { c: c.slice(), s: s.slice() };
    else if (prev.current && action)
      for (let i = 0; i < n; i++)
        if (prev.current[i] !== action[i]) {
          cur.current.c.set([1, 1, 1], i * 3); // flipped tier: flash white, then tween to the new colour
          cur.current.s[i] = 7;
        }
    prev.current = action;
  }, [action, prob, n, umap.split, animate]);

  useEffect(() => {
    const cv = cvEl;
    if (!cv || !visible) return; // paused while off-screen
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const font = "10px " + (getComputedStyle(cv).getPropertyValue("--font-mono").trim() || "monospace");
    const furniture = (w: number, h: number) => {
      const x0 = PAD, x1 = w - PAD, y0 = PAD, y1 = h - PAD;
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const b = 10;
      // corner brackets
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
        ctx.moveTo(cx + 0.5, cy + sy * b + 0.5);
        ctx.lineTo(cx + 0.5, cy + 0.5);
        ctx.lineTo(cx + sx * b + 0.5, cy + 0.5);
      }
      // outward ticks every 10% along the bottom and left edges
      for (let i = 0; i <= 10; i++) {
        const tx = Math.round(x0 + ((x1 - x0) * i) / 10) + 0.5, ty = Math.round(y1 - ((y1 - y0) * i) / 10) + 0.5;
        const L = i % 5 === 0 ? 6 : 3;
        ctx.moveTo(tx, y1 + 4);
        ctx.lineTo(tx, y1 + 4 + L);
        ctx.moveTo(x0 - 4, ty);
        ctx.lineTo(x0 - 4 - L, ty);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(90,98,116,1)";
      ctx.font = font;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("UMAP-1 →", x1, y1 + 14);
      ctx.save();
      ctx.translate(x0 - 14, y0);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("UMAP-2 →", 0, 0);
      ctx.restore();
    };
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, devicePixelRatio);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      furniture(w, h);
      const T = tgt.current, C = cur.current;
      if (T && C) {
        const k = animate ? 1 - Math.exp(-dt * 3.2) : 1;
        const sz = Math.min(1, Math.max(0.6, w / 820)); // smaller marks on narrow screens
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < 3; j++) C.c[i * 3 + j] += (T.c[i * 3 + j] - C.c[i * 3 + j]) * k;
          C.s[i] += (T.s[i] - C.s[i]) * k;
          const [px, py] = project(umap.xy[i][0], umap.xy[i][1], w, h);
          ctx.fillStyle = `rgba(${(C.c[i * 3] * 255) | 0},${(C.c[i * 3 + 1] * 255) | 0},${(C.c[i * 3 + 2] * 255) | 0},0.9)`;
          ctx.beginPath();
          ctx.arc(px, py, C.s[i] * sz, 0, Math.PI * 2);
          ctx.fill();
        }
        const hi = hov.current;
        if (hi >= 0 && hi < n) {
          const [px, py] = project(umap.xy[hi][0], umap.xy[hi][1], w, h);
          ctx.strokeStyle = "rgba(232,235,241,0.9)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, C.s[hi] * sz + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(232,235,241,0.25)";
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(PAD - 4, py);
          ctx.lineTo(px - C.s[hi] - 6, py);
          ctx.moveTo(px, h - PAD + 4);
          ctx.lineTo(px, py + C.s[hi] + 6);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cvEl, visible, n, umap.xy, animate]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvEl!;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 100;
    for (let i = 0; i < n; i++) {
      const [px, py] = project(umap.xy[i][0], umap.xy[i][1], r.width, r.height);
      const d = (px - mx) ** 2 + (py - my) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    hov.current = best;
    onHover?.(best >= 0 ? best : null, mx, my);
  };

  return (
    <canvas
      ref={setCvEl}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }}
      onPointerMove={pick}
      onPointerLeave={() => {
        hov.current = -1;
        onHover?.(null, 0, 0);
      }}
    />
  );
}
