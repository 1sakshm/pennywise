// Shared look for the Open Graph share cards (1200x630). Values come from URL params that were
// produced by real router output or a real game score; params are validated and clamped here.
import type { ReactNode } from "react";

export const TIER_HEX: Record<string, string> = { small: "#2dd4bf", medium: "#818cf8", large: "#f472b6" };

export const int = (v: string | null, lo: number, hi: number, d = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
export const num = (v: string | null, lo: number, hi: number, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
export const tierOf = (v: string | null) => (v && v in TIER_HEX ? v : "small");
export const clean = (v: string | null, max = 120) => (v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);

export function Card({ children, accent = "#facc15" }: { children: ReactNode; accent?: string }) {
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: "radial-gradient(900px 500px at 80% 0%, rgba(129,140,248,.18), transparent 60%), #05060a",
        color: "#e6e9f2", padding: "56px 64px", fontFamily: "sans-serif",
      }}
    >
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#8b93a7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: accent }} />
          laya-router · Jev chooses. This one learns.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {Object.values(TIER_HEX).map((c) => (
            <div key={c} style={{ width: 36, height: 8, borderRadius: 4, background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}
