"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { lamKey, pct, TIER_COLOR, TIERS, usd, type PromptRow, type RouterActions } from "@/lib/data";
import { useData, useIsMobile, useReducedMotion, useStore } from "./Store";

type Mode = "always-large" | "zero-shot" | "trained";
const MODE_LABEL: Record<Mode, string> = { "always-large": "Always large", "zero-shot": "Zero-shot Laya", trained: "RL-trained Laya" };

type Totals = { n: number; correct: number; cost: number; largeCost: number; byTier: number[] };
const empty = (): Totals => ({ n: 0, correct: 0, cost: 0, largeCost: 0, byTier: [0, 0, 0] });

export default function ParticleRouter() {
  const prompts = useData<PromptRow[]>("prompts.json");
  const actions = useData<RouterActions>("router_actions.json");
  const { lambda } = useStore();
  const [mode, setMode] = useState<Mode>("trained");
  const [totals, setTotals] = useState<Totals>(empty);
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const host = useRef<HTMLDivElement>(null);

  const acts = useMemo(() => {
    if (!actions) return null;
    if (mode === "always-large") return actions["always-large"];
    if (mode === "zero-shot") return actions["zero-shot"];
    return actions.rl[lamKey(lambda)] ?? Object.values(actions.rl)[0];
  }, [actions, mode, lambda]);

  // Exact totals over the whole test set for the current policy (shown under the animation)
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
    });
    return t;
  }, [prompts, acts]);

  const state = useRef({ acts, prompts });
  state.current = { acts, prompts };

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

      const g = new PIXI.Graphics().circle(16, 16, 6).fill({ color: 0xffffff }).circle(16, 16, 14).fill({ color: 0xffffff, alpha: 0.12 });
      const dotTex = app.renderer.generateTexture(g);
      const lanes = new PIXI.Graphics();
      const node = new PIXI.Graphics();
      app.stage.addChild(lanes, node);
      const layer = new PIXI.Container();
      app.stage.addChild(layer);

      const geo = () => {
        const w = app.screen.width, h = app.screen.height;
        return { w, h, nx: w * 0.4, ny: h * 0.5, ex: w * 0.96, ey: [h * 0.18, h * 0.5, h * 0.82] };
      };
      const drawStatic = () => {
        const { w, h, nx, ny, ex, ey } = geo();
        lanes.clear();
        TIERS.forEach((t, i) => {
          const c = parseInt(TIER_COLOR[t].slice(1), 16);
          lanes.moveTo(nx, ny).bezierCurveTo(nx + (ex - nx) * 0.45, ny, nx + (ex - nx) * 0.55, ey[i], ex, ey[i]).stroke({ color: c, alpha: 0.35, width: 2 });
          lanes.circle(ex, ey[i], 10).fill({ color: c, alpha: 0.25 });
        });
        lanes.moveTo(0, h * 0.5).lineTo(nx, ny).stroke({ color: 0xffffff, alpha: 0.05, width: 60 });
        void w;
      };
      drawStatic();
      const onResize = () => drawStatic();
      app.renderer.on("resize", onResize);

      type P = { s: InstanceType<typeof PIXI.Sprite>; i: number; t: number; y0: number; a: number; phase: number; flash: number };
      const live: P[] = [];
      let k = Math.floor(Math.random() * prompts.length);
      let acc = 0;
      let pulse = 0;
      const spawnEvery = mobile ? 300 : 150;
      const maxLive = mobile ? 40 : 120;

      app.ticker.add((tk) => {
        const dt = tk.deltaMS;
        const { acts: A, prompts: PR } = state.current;
        if (!A || !PR) return;
        const { h, nx, ny, ex, ey } = geo();
        pulse += dt / 1000;
        node.clear();
        const r = 18 + Math.sin(pulse * 3) * 2;
        node.circle(nx, ny, r * 2.4).fill({ color: 0xfacc15, alpha: 0.06 }).circle(nx, ny, r).fill({ color: 0xfacc15, alpha: 0.9 });

        acc += dt;
        while (acc > spawnEvery && live.length < maxLive) {
          acc -= spawnEvery;
          const i = k++ % PR.length;
          const s = new PIXI.Sprite(dotTex);
          s.anchor.set(0.5);
          s.blendMode = "add";
          s.tint = 0xcbd5e1;
          s.scale.set(0.7);
          layer.addChild(s);
          live.push({ s, i, t: 0, y0: h * (0.15 + Math.random() * 0.7), a: A[i], phase: 0, flash: 0 });
        }
        if (acc > spawnEvery) acc = 0;

        for (let j = live.length - 1; j >= 0; j--) {
          const p = live[j];
          if (p.phase === 0) {
            p.t += dt / 1100;
            const u = Math.min(1, p.t);
            const e = u * u * (3 - 2 * u);
            p.s.x = e * nx;
            p.s.y = p.y0 + (ny - p.y0) * e;
            if (u >= 1) {
              p.phase = 1;
              p.t = 0;
              p.a = A[p.i];
              p.s.tint = parseInt(TIER_COLOR[TIERS[p.a]].slice(1), 16);
            }
          } else if (p.phase === 1) {
            p.t += dt / 1300;
            const u = Math.min(1, p.t);
            const x0 = nx, x3 = ex, y3 = ey[p.a];
            const x1 = nx + (ex - nx) * 0.45, x2 = nx + (ex - nx) * 0.55;
            const v = 1 - u;
            p.s.x = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3;
            p.s.y = v * v * v * ny + 3 * v * v * u * ny + 3 * v * u * u * y3 + u * u * u * y3;
            if (u >= 1) {
              p.phase = 2;
              const ok = PR[p.i].correct[p.a] === 1;
              p.s.tint = ok ? 0x4ade80 : 0xf87171;
              p.s.scale.set(1.6);
              setTotals((T) => ({
                n: T.n + 1,
                correct: T.correct + (ok ? 1 : 0),
                cost: T.cost + PR[p.i].cost[p.a],
                largeCost: T.largeCost + PR[p.i].cost[2],
                byTier: T.byTier.map((c, q) => c + (q === p.a ? 1 : 0)),
              }));
            }
          } else {
            p.flash += dt / 500;
            p.s.alpha = Math.max(0, 1 - p.flash);
            p.s.scale.set(1.6 + p.flash * 1.5);
            if (p.flash >= 1) {
              layer.removeChild(p.s);
              p.s.destroy();
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
  return (
    <div className="pr">
      <div className="bar">
        <div className="seg" role="group" aria-label="Routing policy">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
              {m === "trained" ? ` · λ=${lambda}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="stage">
        {!reduced && <div ref={host} className="canvas" aria-hidden />}
        <div className="lanelabels" aria-hidden>
          {TIERS.map((t, i) => (
            <span key={t} className={`tier-${t}`} style={{ top: `${[18, 50, 82][i]}%` }}>
              {t}
              {full && <em>{pct(full.byTier[i] / full.n, 0)}</em>}
            </span>
          ))}
        </div>
        <span className="laya">Laya</span>
        {reduced && <p className="rm">Animation off (reduced motion). Exact test-set totals below.</p>}
      </div>
      <div className="stats">
        <div className="stat">
          <span className="v">{shown ? pct(shown.correct / shown.n) : full ? pct(full.correct / full.n) : "—"}</span>
          <span className="k">accuracy{shown ? ` · ${shown.n} flown` : " · test set"}</span>
        </div>
        <div className="stat">
          <span className="v">{shown ? usd(shown.cost) : full ? usd(full.cost) : "—"}</span>
          <span className="k">total model cost</span>
        </div>
        <div className="stat">
          <span className="v">{shown ? pct(shown.cost / shown.largeCost, 0) : full ? pct(full.cost / full.largeCost, 0) : "—"}</span>
          <span className="k">cost vs always-large</span>
        </div>
        {full && (
          <div className="stat">
            <span className="v small">
              {pct(full.correct / full.n)} · {pct(full.cost / full.largeCost, 0)}
            </span>
            <span className="k">exact on all {full.n} test prompts</span>
          </div>
        )}
      </div>
      <style jsx>{`
        .pr { display: flex; flex-direction: column; gap: 14px; }
        .stage { position: relative; height: clamp(260px, 42vw, 400px); border-radius: var(--radius); border: 1px solid var(--line);
          background: radial-gradient(500px 220px at 40% 50%, rgba(250, 204, 21, 0.05), transparent 70%), rgba(7, 9, 16, 0.6); overflow: hidden; }
        .canvas { position: absolute; inset: 0; }
        .lanelabels span { position: absolute; right: 30px; transform: translateY(-50%); font-family: var(--font-mono); font-size: 13px;
          text-transform: uppercase; letter-spacing: 0.1em; display: flex; flex-direction: column; align-items: flex-end; }
        .lanelabels em { font-style: normal; color: var(--muted); font-size: 11px; }
        .laya { position: absolute; left: 40%; top: calc(50% + 34px); transform: translateX(-50%); font-family: var(--font-mono);
          font-size: 12px; color: var(--accent); letter-spacing: 0.12em; }
        .rm { position: absolute; left: 16px; bottom: 8px; margin: 0; color: var(--muted); font-size: 13px; }
        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .v.small { font-size: 15px; color: var(--muted); }
        @media (max-width: 760px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .lanelabels span { right: 12px; } }
      `}</style>
    </div>
  );
}
