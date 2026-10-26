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
  const src = liveStats ? "live · via the proxy" : manifest?.measured_savings.label;
  return (
    <div className="savings" role="status" title={`Saved $${usdVal.toFixed(digits)} across ${n.toLocaleString()} routed requests — ${src}`}>
      <span className={liveStats ? "led" : "led off"} aria-hidden />
      <span className="lbl">saved</span>
      <strong>
        <Roll text={`$${usdVal.toFixed(digits)}`} />
      </strong>
      <span className="sep" aria-hidden>·</span>
      <span className="n">
        <Roll text={n.toLocaleString()} />
      </span>
      <span className="lbl">routed</span>
      <span className="src">{liveStats ? "live" : src}</span>
      <style jsx>{`
        .savings {
          display: inline-flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap;
          font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; line-height: 1;
          padding: 7px 10px; border-radius: var(--radius); border: 1px solid var(--line-2); background: var(--bg-2);
        }
        strong { font-size: 12.5px; color: var(--accent); font-weight: 500; letter-spacing: 0; }
        .n { color: var(--text); font-size: 12.5px; letter-spacing: 0; }
        .lbl, .sep { color: var(--muted); }
        .src { color: var(--dim); text-transform: none; letter-spacing: 0.02em; padding-left: 8px; border-left: 1px solid var(--line); }
        @media (max-width: 1100px) { .src { display: none; } }
      `}</style>
    </div>
  );
}
