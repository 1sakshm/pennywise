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
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box",
        backgroundColor: "#05060a", backgroundImage: "radial-gradient(900px 500px at 80% 0%, rgba(129,140,248,.18), transparent 60%)",
        color: "#e6e9f2", padding: "56px 64px", fontFamily: "sans-serif",
      }}
    >
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#8b93a7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: accent }} />
          Pennywise · Jev chooses. This one learns.
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

// Card bodies shared by the image routes (route.dyn.tsx, server deploys) and the static share pages.
export function GameBody({ you, laya }: { you: number; laya: number }) {
  const verdict = you > laya ? "I beat the router." : you === laya ? "Dead heat with the router." : "The router beat me.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontSize: 28, color: "#8b93a7", letterSpacing: 4, textTransform: "uppercase" }}>Beat the Router</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28, fontSize: 150, fontWeight: 800, letterSpacing: -4, whiteSpace: "nowrap" }}>
        <span>You {you}</span>
        <span style={{ color: "#5b6377" }}>–</span>
        <span style={{ color: "#facc15" }}>{laya} Laya</span>
      </div>
      <div style={{ fontSize: 40 }}>{verdict} Can you pick the cheapest LLM that still gets it right?</div>
    </div>
  );
}

export function DecisionBody({ tier, ms, conf, saved, p }: { tier: string; ms: number; conf: number; saved: number; p: string }) {
  const savedTxt = saved >= 0.01 ? `$${saved.toFixed(2)}` : `$${saved.toFixed(4)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontSize: 28, color: "#8b93a7", letterSpacing: 4, textTransform: "uppercase" }}>Routing decision</div>
      <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -3, whiteSpace: "nowrap" }}>
        Routed to&nbsp;<span style={{ color: TIER_HEX[tier] }}>{tier.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", gap: 36, fontSize: 40, color: "#cbd5e1", whiteSpace: "nowrap" }}>
        <span>{ms} ms</span>
        <span>{conf}% confident</span>
        <span style={{ color: "#facc15" }}>saved {savedTxt} vs large</span>
      </div>
      {p && (
        <div style={{ fontSize: 30, color: "#8b93a7", borderLeft: "4px solid #334155", paddingLeft: 20, maxHeight: 130, overflow: "hidden" }}>
          “{p}”
        </div>
      )}
    </div>
  );
}
