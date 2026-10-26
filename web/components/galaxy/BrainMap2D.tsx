"use client";
import { useEffect, useRef } from "react";
import { TIER_RGB, TIERS } from "@/lib/data";
import type { GalaxyProps } from "./Galaxy3D";

// 2D fallback for the galaxy: same data, canvas 2D, colors tween between checkpoints.
export default function BrainMap2D({ umap, action, prob, onHover, animate = true }: GalaxyProps & { animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tgt = useRef<{ c: Float32Array; s: Float32Array } | null>(null);
  const cur = useRef<{ c: Float32Array; s: Float32Array } | null>(null);
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
    const pad = 28;
    return [pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad), h - pad - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * pad)];
  };

  useEffect(() => {
    const c = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = action ? action[i] : -1;
      c.set(a >= 0 ? TIER_RGB[TIERS[a]] : [0.55, 0.58, 0.65], i * 3);
      s[i] = (1.6 + 3.2 * (prob ? prob[i] : 0.5)) * (umap.split[i] === "test" ? 1.2 : 1);
    }
    tgt.current = { c, s };
    if (!cur.current || !animate) cur.current = { c: c.slice(), s: s.slice() };
    else if (prev.current && action)
      for (let i = 0; i < n; i++)
        if (prev.current[i] !== action[i]) {
          cur.current.c.set([1, 1, 1], i * 3); // flipped tier: flash white, then tween to the new colour
          cur.current.s[i] = 9;
        }
    prev.current = action;
  }, [action, prob, n, umap.split, animate]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, devicePixelRatio);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const T = tgt.current, C = cur.current;
      if (T && C) {
        const k = animate ? 1 - Math.exp(-dt * 3.2) : 1;
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < 3; j++) C.c[i * 3 + j] += (T.c[i * 3 + j] - C.c[i * 3 + j]) * k;
          C.s[i] += (T.s[i] - C.s[i]) * k;
          const [px, py] = project(umap.xy[i][0], umap.xy[i][1], w, h);
          ctx.fillStyle = `rgba(${(C.c[i * 3] * 255) | 0},${(C.c[i * 3 + 1] * 255) | 0},${(C.c[i * 3 + 2] * 255) | 0},0.85)`;
          ctx.beginPath();
          ctx.arc(px, py, C.s[i], 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, umap.xy, animate]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current!;
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
    onHover?.(best >= 0 ? best : null, mx, my);
  };

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} onPointerMove={pick} onPointerLeave={() => onHover?.(null, 0, 0)} />;
}
