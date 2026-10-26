"use client";
// Renders a 1200x630 share card as HTML, scaled to fit its container. Used by the static
// share pages (the static export has no image server; params are clamped in lib/og).
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScaledCard({ children, label }: { children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0.5);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setS(el.clientWidth / 1200));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} role="img" aria-label={label}
      style={{ width: "100%", maxWidth: 900, aspectRatio: "1200 / 630", borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden", position: "relative" }}>
      <div style={{ width: 1200, height: 630, transform: `scale(${s})`, transformOrigin: "top left", position: "absolute", display: "flex" }}>{children}</div>
    </div>
  );
}
