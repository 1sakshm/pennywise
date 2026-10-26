"use client";
// FIG. 1 — routing trace. Replays the held-out test prompts through the selected policy: each
// particle is one prompt, routed to the tier the policy chose, and turns green/red by its real
// graded outcome. Counters accumulate what is flown; exact totals over the full test set below.
import { useEffect, useMemo, useRef, useState } from "react";
import { lamKey, pct, TIER_COLOR, TIERS, usd, type PromptRow, type RouterActions } from "@/lib/data";
import { useData, useIsMobile, useReducedMotion, useStore } from "./Store";

type Mode = "always-large" | "zero-shot" | "trained";
const MODE_LABEL: Record<Mode, string> = { "always-large": "always-large", "zero-shot": "zero-shot", trained: "RL-trained" };

type Totals = { n: number; correct: number; cost: number; largeCost: number; byTier: number[]; okByTier: number[] };
const empty = (): Totals => ({ n: 0, correct: 0, cost: 0, largeCost: 0, byTier: [0, 0, 0], okByTier: [0, 0, 0] });
const LANE_Y = [0.2, 0.5, 0.8];
const GATE_X = 0.42;

export default function ParticleRouter() {
  const prompts = useData<PromptRow[]>("prompts.json");
  const actions = useData<RouterActions>("router_actions.json");
  const { lambda } = useStore();
  const [mode, setMode] = useState<Mode>("trained");
  const [totals, setTotals] = useState<Totals>(empty);
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const host = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  const acts = useMemo(() => {
    if (!actions) return null;
    if (mode === "always-large") return actions["always-large"];
    if (mode === "zero-shot") return actions["zero-shot"];
    return actions.rl[lamKey(lambda)] ?? Object.values(actions.rl)[0];
  }, [actions, mode, lambda]);

  // Exact totals over the whole test set for the current policy
  const full = useMemo(() => {
    if (!prompts || !acts) return null;
    const t = empty();
    prompts.forEach((p, i) => {
      const a = acts[i];
      t.n++;
      t.correct += p.correct[a];
      t.cost += p.cost[a];
      t.largeCost += p.cost[2];
      t.byTier[a]++;
      t.okByTier[a] += p.correct[a];
    });
    return t;
  }, [prompts, acts]);

  const state = useRef({ acts, prompts });
  state.current = { acts, prompts };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!host.current || !prompts || reduced) return;
    let destroyed = false;
    let cleanup = () => {};
    (async () => {
      const PIXI = await import("pixi.js");
      const el = host.current!;
      const app = new PIXI.Application();
      await app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, devicePixelRatio), autoDensity: true });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);

      const dotTex = app.renderer.generateTexture(new PIXI.Graphics().circle(6, 6, 2.6).fill({ color: 0xffffff }));
      const ringTex = app.renderer.generateTexture(new PIXI.Graphics().circle(12, 12, 10).stroke({ color: 0xffffff, width: 1.2 }));
      const scaffold = new PIXI.Graphics();
      const gate = new PIXI.Graphics();
      const layer = new PIXI.Container();
      app.stage.addChild(scaffold, layer, gate);

      const geo = () => {
        const w = app.screen.width, h = app.screen.height;
        const nx = w * GATE_X, ex = w - (mobile ? 64 : 120);
        return { w, h, nx, ny: h * 0.5, ex, ey: LANE_Y.map((f) => h * f), feeds: [0.14, 0.27, 0.4, 0.5, 0.6, 0.73, 0.86].map((f) => h * f) };
      };
      const drawStatic = () => {
        const { w, nx, ny, ex, ey, feeds } = geo();
        scaffold.clear();
        // input feed channels (dotted) converging on the gate
        feeds.forEach((fy) => {
          for (let x = 8; x < nx - 70; x += 6) scaffold.rect(x, fy, 2, 1).fill({ color: 0x94a3b8, alpha: 0.18 });
          scaffold.moveTo(nx - 70, fy).bezierCurveTo(nx - 40, fy, nx - 40, ny, nx - 24, ny).stroke({ color: 0x94a3b8, alpha: 0.12, width: 1 });
        });
        // output lanes with ticks every 24px
        TIERS.forEach((t, i) => {
          const c = parseInt(TIER_COLOR[t].slice(1), 16);
          const x1 = nx + (ex - nx) * 0.45, x2 = nx + (ex - nx) * 0.55;
          scaffold.moveTo(nx + 24, ny).bezierCurveTo(x1, ny, x2, ey[i], ex, ey[i]).stroke({ color: c, alpha: 0.45, width: 1 });
          for (let x = x2 + 20; x < ex - 4; x += 24) scaffold.rect(x, ey[i] - 3, 1, 6).fill({ color: c, alpha: 0.35 });
          scaffold.rect(ex - 5, ey[i] - 5, 10, 10).stroke({ color: c, alpha: 0.9, width: 1 });
          scaffold.moveTo(ex + 5, ey[i]).lineTo(w, ey[i]).stroke({ color: c, alpha: 0.12, width: 1 });
        });
      };
      drawStatic();
      const onResize = () => drawStatic();
      app.renderer.on("resize", onResize);

      type P = { s: InstanceType<typeof PIXI.Sprite>; i: number; t: number; y0: number; a: number; phase: number; flash: number; ring?: InstanceType<typeof PIXI.Sprite> };
      const live: P[] = [];
      let k = Math.floor(Math.random() * prompts.length);
      let acc = 0;
      let clock = 0;
      let lastHit = -10;
      const spawnEvery = mobile ? 280 : 140;
      const maxLive = mobile ? 40 : 110;

      app.ticker.add((tk) => {
        if (!visible.current) return;
        const dt = Math.min(50, tk.deltaMS);
        const { acts: A, prompts: PR } = state.current;
        if (!A || !PR) return;
        const { nx, ny, ex, ey, feeds } = geo();
        clock += dt / 1000;

        // decision gate: crisp frame + a scan line; brightens briefly on each decision
        const hot = Math.max(0, 1 - (clock - lastHit) * 4);
        gate.clear();
        gate.rect(nx - 24, ny - 46, 48, 92).fill({ color: 0x0b0d12, alpha: 0.95 }).stroke({ color: 0xfacc15, alpha: 0.55 + 0.45 * hot, width: 1 });
        const sy = ny - 40 + ((clock * 60) % 80);
        gate.rect(nx - 18, sy, 36, 1).fill({ color: 0xfacc15, alpha: 0.5 });
        [-1, 1].forEach((sx) => gate.rect(nx + sx * 24 - (sx > 0 ? 0 : 4), ny - 1, 4, 2).fill({ color: 0xfacc15, alpha: 0.9 }));

        acc += dt;
        while (acc > spawnEvery && live.length < maxLive) {
          acc -= spawnEvery;
          const i = k++ % PR.length;
          const s = new PIXI.Sprite(dotTex);
          s.anchor.set(0.5);
          s.tint = 0xcbd5e1;
          s.alpha = 0.9;
          layer.addChild(s);
          live.push({ s, i, t: 0, y0: feeds[Math.floor(Math.random() * feeds.length)], a: A[i], phase: 0, flash: 0 });
        }
        if (acc > spawnEvery) acc = 0;

        for (let j = live.length - 1; j >= 0; j--) {
          const p = live[j];
          if (p.phase === 0) {
            p.t += dt / 1400;
            const u = Math.min(1, p.t);
            const gx = nx - 24, x70 = nx - 70;
            if (u < 0.7) {
              p.s.x = (u / 0.7) * x70;
              p.s.y = p.y0;
            } else {
              const v = (u - 0.7) / 0.3, w1 = 1 - v; // bezier into the gate
              p.s.x = w1 * w1 * w1 * x70 + 3 * w1 * w1 * v * (nx - 40) + 3 * w1 * v * v * (nx - 40) + v * v * v * gx;
              p.s.y = w1 * w1 * w1 * p.y0 + 3 * w1 * w1 * v * p.y0 + 3 * w1 * v * v * ny + v * v * v * ny;
            }
            if (u >= 1) {
              p.phase = 1;
              p.t = 0;
              p.a = A[p.i];
              p.s.tint = parseInt(TIER_COLOR[TIERS[p.a]].slice(1), 16);
              lastHit = clock;
            }
          } else if (p.phase === 1) {
            p.t += dt / 1500;
            const u = Math.min(1, p.t);
            const x0 = nx + 24, x3 = ex, y3 = ey[p.a];
            const x1 = nx + (ex - nx) * 0.45, x2 = nx + (ex - nx) * 0.55;
            const v = 1 - u;
            p.s.x = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3;
            p.s.y = v * v * v * ny + 3 * v * v * u * ny + 3 * v * u * u * y3 + u * u * u * y3;
            if (u >= 1) {
              p.phase = 2;
              const ok = PR[p.i].correct[p.a] === 1;
              p.s.tint = ok ? 0x4ade80 : 0xf87171;
              const r = new PIXI.Sprite(ringTex);
              r.anchor.set(0.5);
              r.position.set(p.s.x, p.s.y);
              r.tint = p.s.tint;
              r.scale.set(0.4);
              layer.addChild(r);
              p.ring = r;
              setTotals((T) => ({
                n: T.n + 1,
                correct: T.correct + (ok ? 1 : 0),
                cost: T.cost + PR[p.i].cost[p.a],
                largeCost: T.largeCost + PR[p.i].cost[2],
                byTier: T.byTier.map((c, q) => c + (q === p.a ? 1 : 0)),
                okByTier: T.okByTier.map((c, q) => c + (q === p.a && ok ? 1 : 0)),
              }));
            }
          } else {
            p.flash += dt / 650;
            const f = Math.min(1, p.flash);
            p.s.alpha = 1 - f;
            if (p.ring) {
              p.ring.scale.set(0.4 + f * 1.1);
              p.ring.alpha = 1 - f;
            }
            if (f >= 1) {
              layer.removeChild(p.s);
              p.s.destroy();
              if (p.ring) {
                layer.removeChild(p.ring);
                p.ring.destroy();
              }
              live.splice(j, 1);
            }
          }
        }
      });
      cleanup = () => {
        app.renderer.off("resize", onResize);
        app.destroy(true, { children: true, texture: true });
      };
    })();
    return () => {
      destroyed = true;
      cleanup();
    };
  }, [prompts, reduced, mobile]);

  useEffect(() => setTotals(empty()), [mode, lambda]);

  const shown = totals.n >= 20 ? totals : null;
  const src = shown ?? full;
  return (
    <figure className="pr panel">
      <div className="fig-head">
        <span className="fig-id">FIG. 1</span>
        <span className="hide-sm">routing trace · replay of held-out test prompts</span>
        <span className="sp" />
        <div className="seg" role="group" aria-label="Routing policy">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
              {m === "trained" ? ` λ=${lambda}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="stage">
        {!reduced && <div ref={host} className="canvas" aria-hidden />}
        <div className="axis" aria-hidden>
          <span>requests · test split</span>
          <span className="g">π(a|s)</span>
          <span className="o">tier · share · acc</span>
        </div>
        <div className="lanelabels" aria-hidden>
          {TIERS.map((t, i) => (
            <span key={t} style={{ top: `${LANE_Y[i] * 100}%` }}>
              <b className={`tier-${t}`}>{t}</b>
              {src && src.n > 0 && (
                <em>
                  {pct(src.byTier[i] / src.n, 0)} · {src.byTier[i] ? pct(src.okByTier[i] / src.byTier[i], 0) : "—"}
                </em>
              )}
            </span>
          ))}
        </div>
        {reduced && <p className="rm">Animation off (reduced motion). Exact test-set totals below.</p>}
      </div>
      <div className="stats">
        <div className="stat">
          <span className="v">{src ? pct(src.correct / src.n) : "—"}</span>
          <span className="k">accuracy{shown ? ` · ${shown.n} replayed` : " · test set"}</span>
        </div>
        <div className="stat">
          <span className="v">{src ? usd(src.cost) : "—"}</span>
          <span className="k">model cost (list price)</span>
        </div>
        <div className="stat">
          <span className="v">{src ? pct(src.cost / src.largeCost, 1) : "—"}</span>
          <span className="k">cost vs always-large</span>
        </div>
        <div className="stat">
          <span className="v exact">{full ? `${pct(full.correct / full.n)} @ ${pct(full.cost / full.largeCost, 1)}` : "—"}</span>
          <span className="k">exact · all {full?.n ?? "—"} test prompts</span>
        </div>
      </div>
      <figcaption className="fig-cap cap">
        <b>Fig. 1</b> — Each particle is one held-out prompt. The gate is the policy <span className="math">π(a|s)</span>; particles take the lane of the tier it
        picks and turn <span style={{ color: "var(--ok)" }}>green</span> / <span style={{ color: "var(--bad)" }}>red</span> by that tier&apos;s real graded answer.
        Lane labels: share of requests · accuracy within the lane.
      </figcaption>
      <style jsx>{`
        .pr { margin: 0; }
        .stage { position: relative; height: clamp(280px, 40vw, 420px); overflow: hidden; border-bottom: 1px solid var(--line);
          background-image: linear-gradient(to right, rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.05) 1px, transparent 1px);
          background-size: 40px 40px; background-position: -1px -1px; }
        .canvas { position: absolute; inset: 0; }
        .axis { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); padding: 0 12px; pointer-events: none; }
        .axis .g { position: absolute; left: ${GATE_X * 100}%; transform: translateX(-50%); color: var(--accent); text-transform: none; font-family: var(--font-serif); font-style: italic; font-size: 15px; letter-spacing: 0; bottom: -2px; }
        .axis .o { margin-left: auto; }
        .lanelabels span { position: absolute; right: 12px; transform: translateY(calc(-50% - 16px)); font-family: var(--font-mono); font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.1em; display: flex; flex-direction: column; align-items: flex-end; line-height: 1.3; }
        .lanelabels b { font-weight: 500; }
        .lanelabels em { font-style: normal; color: var(--muted); font-size: 10.5px; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
        .rm { position: absolute; left: 16px; top: 12px; margin: 0; color: var(--muted); font-size: 13px; }
        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .stats .stat { padding: 14px 16px; border-right: 1px solid var(--line); }
        .stats .stat:last-child { border-right: 0; }
        .v.exact { font-size: clamp(14px, 1.5vw, 17px); color: var(--muted); padding-top: 6px; }
        .cap { margin: 0; padding: 10px 16px 14px; border-top: 1px solid var(--line); }
        @media (max-width: 760px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .stats .stat:nth-child(2) { border-right: 0; }
          .stats .stat:nth-child(-n + 2) { border-bottom: 1px solid var(--line); }
          .hide-sm { display: none; }
          .axis span:first-child { display: none; }
        }
      `}</style>
    </figure>
  );
}
