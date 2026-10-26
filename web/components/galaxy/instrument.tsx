"use client";
// Small instrument-panel helpers shared by the galaxy and Pareto figures (DESIGN.md: research instrument).
import { useEffect, useState, type CSSProperties } from "react";

/** Callback-ref + ResizeObserver: returns [ref, {w, h}, element]. Works when the element mounts late. */
export function useSize<T extends Element>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size, el] as const;
}

/** True while the element is on screen (or once it has been, with `once`). */
export function useVisible(el: Element | null, once = false, margin = "0px") {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setV(true);
          if (once) io.disconnect();
        } else if (!once) setV(false);
      },
      { rootMargin: margin, threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, once, margin]);
  return v;
}

/** Thin-track range slider with a square-ish thumb and optional labelled stops. */
export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  stops,
  ends,
  id,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  stops?: { v: number; label?: string }[];
  ends?: [string, string];
  id?: string;
}) {
  const p = max > min ? (value - min) / (max - min) : 0;
  return (
    <div className="irange">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(+e.target.value)}
        style={{ "--p": `${p * 100}%` } as CSSProperties}
      />
      {stops && (
        <div className="ir-stops" aria-hidden>
          {stops.map((s) => {
            const q = max > min ? (s.v - min) / (max - min) : 0;
            return (
              <span key={s.v} className={s.v === value ? "on" : ""} style={{ left: `calc(5px + ${q} * (100% - 10px))` }}>
                <i />
                {s.label != null && <em>{s.label}</em>}
              </span>
            );
          })}
        </div>
      )}
      {ends && (
        <div className="ir-ends" aria-hidden>
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      <style jsx global>{`
        .irange { position: relative; width: 100%; min-width: 0; }
        .irange input[type="range"] {
          -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 20px; margin: 0; padding: 0; cursor: pointer;
          background: linear-gradient(to right, var(--accent) 0 var(--p), var(--line-2) var(--p) 100%) center / 100% 2px no-repeat;
        }
        .irange input[type="range"]::-webkit-slider-runnable-track { height: 20px; background: transparent; border: 0; }
        .irange input[type="range"]::-moz-range-track { height: 2px; background: transparent; border: 0; }
        .irange input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 10px; height: 16px; margin-top: 2px; border-radius: 2px;
          border: 1px solid var(--bg); background: linear-gradient(var(--bg), var(--bg)) center / 1px 8px no-repeat, var(--text);
          transition: transform 0.2s var(--ease);
        }
        .irange input[type="range"]::-moz-range-thumb {
          width: 10px; height: 16px; border-radius: 2px; border: 1px solid var(--bg);
          background: linear-gradient(var(--bg), var(--bg)) center / 1px 8px no-repeat, var(--text);
        }
        .irange input[type="range"]:active::-webkit-slider-thumb { transform: scaleY(1.12); }
        .irange input[type="range"]:focus-visible { outline: 1px solid var(--accent); outline-offset: 3px; }
        .ir-stops { position: relative; height: 18px; margin-top: 1px; }
        .ir-stops span { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .ir-stops i { width: 1px; height: 4px; background: var(--line-2); }
        .ir-stops em { font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--dim); font-variant-numeric: tabular-nums; transition: color 0.2s; }
        .ir-stops .on i { background: var(--accent); }
        .ir-stops .on em { color: var(--text); }
        .ir-ends { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-top: 2px; }
      `}</style>
    </div>
  );
}

/** Tiny sparkline (no axes) — values up to `upto` drawn solid, the rest faint. */
export function Sparkline({ values, upto, height = 28, color = "var(--accent)" }: { values: number[]; upto: number; height?: number; color?: string }) {
  const n = values.length;
  if (n < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const sx = (i: number) => (i / (n - 1)) * 100;
  const sy = (v: number) => (hi > lo ? 2 + (1 - (v - lo) / (hi - lo)) * (height - 4) : height / 2);
  const path = (a: number[], off = 0) => a.map((v, i) => `${i ? "L" : "M"}${sx(i + off).toFixed(2)},${sy(v).toFixed(2)}`).join("");
  const k = Math.max(0, Math.min(upto, n - 1));
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden style={{ display: "block", overflow: "visible" }}>
      <path d={path(values)} fill="none" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {k > 0 && <path d={path(values.slice(0, k + 1))} fill="none" stroke={color} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
      <line x1={sx(k)} x2={sx(k)} y1={0} y2={height} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
    </svg>
  );
}

export const pad = (n: number, w = 4) => String(Math.round(n)).padStart(w, "0");
