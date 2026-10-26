"use client";
import { useStore } from "./Store";

// One rolling column per character; digits slide vertically to their new value.
function Roll({ text }: { text: string }) {
  return (
    <span className="roll" aria-label={text}>
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="col" aria-hidden>
            <span className="strip" style={{ transform: `translateY(-${+ch * 10}%)` }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden>
            {ch}
          </span>
        ),
      )}
      <style jsx>{`
        .roll { display: inline-flex; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
        .col { display: inline-block; height: 1.2em; overflow: hidden; line-height: 1.2em; }
        .strip { display: flex; flex-direction: column; transition: transform 0.9s cubic-bezier(0.2, 0.9, 0.2, 1); }
        .strip span { height: 1.2em; }
      `}</style>
    </span>
  );
}

export default function SavingsCounter() {
  const { health, manifest, live } = useStore();
  const liveStats = health && live === "live" && health.stats.requests_routed > 0 ? health.stats : null;
  const usdVal = liveStats ? liveStats.savings_usd : manifest?.measured_savings.usd;
  const n = liveStats ? liveStats.requests_routed : manifest?.measured_savings.requests;
  if (usdVal == null || n == null) return null;
  const digits = usdVal < 1 ? 4 : 2;
  return (
    <div className="savings" role="status">
      <span className="pulse" data-live={!!liveStats} />
      <span className="lbl">saved</span>
      <strong>
        <Roll text={`$${usdVal.toFixed(digits)}`} />
      </strong>
      <span className="lbl">
        across <Roll text={n.toLocaleString()} /> routed requests
      </span>
      <span className="src">{liveStats ? "live · via the proxy" : manifest?.measured_savings.label}</span>
      <style jsx>{`
        .savings {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px;
          padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line-2); background: rgba(5, 6, 10, 0.75);
          backdrop-filter: blur(10px);
        }
        strong { font-size: 18px; color: var(--accent); font-weight: 600; }
        .lbl { color: var(--muted); display: inline-flex; gap: 6px; align-items: center; }
        .src { font-size: 11px; color: var(--dim); font-family: var(--font-mono); }
        .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
        .pulse[data-live="true"] { background: var(--ok); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6); animation: p 2s infinite; }
        @keyframes p { 70% { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); } 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); } }
      `}</style>
    </div>
  );
}
