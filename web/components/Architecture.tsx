"use client";
// FIG. 4 — the training loop as one animated figure.
// Forward: request → tokenizer → Laya (ModernBERT-large, 28 layers) → logits at the three [MASK]
// slots → softmax π(a|s) → sample a tier → grader → reward. Backward: REINFORCE gradient into the
// top 4 layers + decision head only. Illustrative animation; nothing here is recorded data.
// Motion: CSS keyframes on opacity / transform / stroke-dashoffset only. One master "clock" element
// advances the example on animationend, so pausing (off-screen) freezes everything in sync.
import { useInView } from "framer-motion";
import { useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/components/Store";

type Tier = "small" | "medium" | "large";
const TIERS: Tier[] = ["small", "medium", "large"];

// Purely illustrative examples (text, relative bar lengths, sampled tier, grader verdict).
const EXAMPLES: { lines: string[]; p: [number, number, number]; tier: Tier; ok: boolean }[] = [
  { lines: ["What is 15% of 240?"], p: [0.74, 0.19, 0.07], tier: "small", ok: true },
  { lines: ["Fix the off-by-one in", "parse_range() so the unit", "tests pass."], p: [0.17, 0.67, 0.16], tier: "medium", ok: true },
  { lines: ["Prove there are infinitely", "many primes of form 4k+3."], p: [0.06, 0.25, 0.69], tier: "large", ok: true },
  { lines: ["CI failed on the lint step.", "Which commit broke it?"], p: [0.58, 0.3, 0.12], tier: "small", ok: false },
];

// ---- geometry (viewBox units) ----
const W = 1160;
const H = 600;
const TOK = ["[CLS]", "question", "[SEP]", "[MASK]", "small", "[MASK]", "medium", "[MASK]", "large", "[SEP]", "request", "[SEP]"];
const MASK_IDX = [3, 5, 7];
const CHW = 6.02; // mono advance at 10px
const X0 = 268;
const chips = (() => {
  let x = X0;
  return TOK.map((t) => {
    const w = Math.round(t.length * CHW + 10);
    const c = { t, x, w, cx: x + w / 2 };
    x += w + 3;
    return c;
  });
})();
const X1 = chips[chips.length - 1].x + chips[chips.length - 1].w;
const STRIP_Y = 550;
const FROZEN = Array.from({ length: 24 }, (_, i) => ({ y: 538 - i * 9, h: 6 }));
const TRAINED = Array.from({ length: 4 }, (_, j) => ({ y: 314 - j * 16, h: 11 }));
const HEAD_Y = 232;
const HEAD_H = 20;
const masks = MASK_IDX.map((i) => chips[i]);
const SM_CX = (masks[0].cx + masks[2].cx) / 2;
const SM = { x: SM_CX - 60, y: 67, w: 120, h: 26 };
const CX = 890; // right column
const CW = 250;
const BAR_ROWS = [52, 80, 108];
const TRACK = { x: 948, w: 192 };
const TIER_Y = [172, 212, 252];
const TIER_H = 32;
const GRADER = { y: 322, h: 36 };
const REWARD = { y: 372, h: 72 };
const UPDATE = { y: 476, h: 58 };
const GX = 852; // gradient channel
const HEAD_R = masks[2].x + masks[2].w;

// ---- timeline (ms) ----
const T = 8200;
const OUT = 7700;
const t = {
  type: 0,
  p1: 820,
  p2: 1080,
  chips: 1480,
  sweep: 1820,
  head: 2700,
  logits: 2850,
  softmax: 3150,
  p5: 3250,
  bars: 3500,
  sample: 4150,
  tier: 4560,
  p7: 4700,
  grade: 5100,
  reward: 5400,
  p8: 5700,
  grad: 5950,
  gradDur: 1150,
};
const GRAD_LEN = CX - GX + (UPDATE.y + 29 - (HEAD_Y + HEAD_H / 2)) + (GX - HEAD_R);
const gradArrive = (y: number) => t.grad + (t.gradDur * (CX - GX + (UPDATE.y + 29 - y))) / GRAD_LEN;

const E = "cubic-bezier(.2,.8,.2,1)";
const anim = (...a: string[]): CSSProperties => ({ animation: a.join(", ") });
const inOut = (d: number, dur = 450) => anim(`ar-in ${dur}ms ${E} ${d}ms both`, `ar-out 450ms ${E} ${OUT}ms forwards`);
const pulse = (d: number, dur: number) => anim(`ar-pulse ${dur}ms cubic-bezier(.45,0,.55,1) ${d}ms`);
const flash = (d: number, dur = 520) => anim(`ar-flash ${dur}ms ease-out ${d}ms`);

function Pulse({ d, delay, dur, color = "var(--text)", w = 2 }: { d: string; delay: number; dur: number; color?: string; w?: number }) {
  return <path className="ar-pulse" d={d} pathLength={100} stroke={color} strokeWidth={w} style={pulse(delay, dur)} />;
}

export default function Architecture() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.25 });
  const reduce = useReducedMotion();
  const [cycle, setCycle] = useState(0);
  const ex = EXAMPLES[reduce ? 1 : cycle % EXAMPLES.length];
  const ti = TIERS.indexOf(ex.tier);
  const tierMid = TIER_Y[ti] + TIER_H / 2;
  const mode = reduce ? "static" : inView ? "run" : "paused";

  const samplePath = `M1044 ${BAR_ROWS[2] + 8} V134 H876 V${tierMid} H${CX - 2}`;
  const answerPath = `M${CX + CW} ${tierMid} H1152 V${GRADER.y + GRADER.h / 2} H${CX + CW + 2}`;
  const gradPath = `M${CX} ${UPDATE.y + 29} H${GX} V${HEAD_Y + HEAD_H / 2} H${HEAD_R + 3}`;

  return (
    <div ref={box} className={`ar ar-${mode}`}>
      <div className="ar-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="ar-title ar-desc">
          <title id="ar-title">Pennywise training loop</title>
          <desc id="ar-desc">
            A request is tokenized into [CLS] question [SEP] [MASK] small [MASK] medium [MASK] large [SEP] request [SEP] and passed through Laya, a 28-layer
            ModernBERT-large encoder whose bottom 24 layers are frozen and cached and whose top 4 layers plus decision head are trained. Logits at the three
            [MASK] positions go through a softmax to give the policy π(a|s). A tier is sampled, answers, is graded automatically, and the reward
            r = 1[correct] − λ·cost/cost_ref drives a REINFORCE update ∇θ log π(a|s)·(r − b), with b a running-mean baseline, into the trained layers only.
          </desc>
          <defs>
            <pattern id="ar-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
            </pattern>
            <marker id="ar-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L7.5,4 L0,7.5 z" fill="var(--muted)" />
            </marker>
            <marker id="ar-ahg" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L7.5,4 L0,7.5 z" fill="var(--accent)" />
            </marker>
            <clipPath id="ar-reqclip">
              <rect x={21} y={41} width={218} height={106} />
            </clipPath>
          </defs>

          {/* ================= static structure ================= */}
          {/* section labels */}
          <g className="ar-sec">
            <text x={20} y={22}><tspan className="n">01</tspan>  Request <tspan className="m">s</tspan></text>
            <text x={X0} y={22}><tspan className="n">02</tspan>  Laya · ModernBERT-large encoder · 28 layers</text>
            <text x={CX} y={22}><tspan className="n">03</tspan>  Policy <tspan className="m">π(a|s)</tspan></text>
            <text x={CX} y={160}><tspan className="n">04</tspan>  Route</text>
            <text x={CX} y={310}><tspan className="n">05</tspan>  Grade · reward</text>
            <text x={CX} y={466}><tspan className="n">06</tspan>  REINFORCE</text>
          </g>
          <text className="ar-note" x={X0} y={40}>one non-autoregressive pass → log <tspan className="m">π</tspan> for every action</text>

          {/* request + tokenizer */}
          <rect className="ar-box" x={20} y={40} width={220} height={108} />
          <text className="ar-lab" x={32} y={58}>prompt</text>
          <line x1={20} x2={240} y1={64} y2={64} className="ar-hair" />
          <rect className="ar-box" x={20} y={166} width={220} height={28} />
          <text className="ar-lab c" x={130} y={184}>tokenizer</text>
          <path className="ar-wire" d="M130 148 V164" markerEnd="url(#ar-ah)" />
          <path className="ar-wire" d={`M40 194 V${STRIP_Y + 13} H${X0 - 3}`} markerEnd="url(#ar-ah)" />

          {/* token columns (behind the stack) */}
          {chips.map((c, i) => {
            const k = MASK_IDX.indexOf(i);
            return k >= 0 ? (
              <line key={i} x1={c.cx} x2={c.cx} y1={STRIP_Y} y2={HEAD_Y + HEAD_H} stroke={`var(--${TIERS[k]})`} strokeOpacity={0.45} strokeDasharray="2 3" />
            ) : (
              <line key={i} x1={c.cx} x2={c.cx} y1={STRIP_Y} y2={TRAINED[3].y} stroke="var(--line)" />
            );
          })}

          {/* frozen layers */}
          {FROZEN.map((b, i) => (
            <g key={i}>
              <rect x={X0} y={b.y} width={X1 - X0} height={b.h} fill="rgba(11,13,18,.82)" />
              <rect x={X0} y={b.y} width={X1 - X0} height={b.h} fill="url(#ar-hatch)" stroke="var(--line-2)" strokeWidth={0.75} />
            </g>
          ))}
          {/* trained layers */}
          {TRAINED.map((b, j) => (
            <rect key={j} x={X0} y={b.y} width={X1 - X0} height={b.h} fill="rgba(11,13,18,.9)" stroke="var(--accent)" strokeOpacity={0.75} />
          ))}
          {/* decision head at the [MASK] slots */}
          {masks.map((c, k) => (
            <g key={k}>
              <rect x={c.x} y={HEAD_Y} width={c.w} height={HEAD_H} fill="var(--panel)" stroke="var(--accent)" />
              <text className="ar-tok" x={c.cx} y={HEAD_Y + 13.5} fill={`var(--${TIERS[k]})`}>z</text>
            </g>
          ))}
          <line x1={masks[0].x + masks[0].w} x2={masks[1].x} y1={HEAD_Y + HEAD_H / 2} y2={HEAD_Y + HEAD_H / 2} stroke="var(--accent)" strokeOpacity={0.4} />
          <line x1={masks[1].x + masks[1].w} x2={masks[2].x} y1={HEAD_Y + HEAD_H / 2} y2={HEAD_Y + HEAD_H / 2} stroke="var(--accent)" strokeOpacity={0.4} />

          {/* left brackets + labels */}
          <g className="ar-brk">
            <path d={`M262 ${HEAD_Y} H258 V${HEAD_Y + HEAD_H} H262`} stroke="var(--accent)" />
            <path d={`M262 ${TRAINED[3].y} H258 V${TRAINED[0].y + TRAINED[0].h} H262`} stroke="var(--accent)" />
            <path d={`M262 ${FROZEN[23].y} H258 V${FROZEN[0].y + FROZEN[0].h} H262`} stroke="var(--line-2)" />
          </g>
          <text className="ar-lab e acc" x={250} y={HEAD_Y + 9}>decision head</text>
          <text className="ar-lab e dim" x={250} y={HEAD_Y + 21}>trained</text>
          <text className="ar-lab e acc" x={250} y={293}>L25–L28</text>
          <text className="ar-lab e dim" x={250} y={305}>trained</text>
          <text className="ar-lab e" x={250} y={436}>L1–L24</text>
          <text className="ar-lab e dim" x={250} y={448}>frozen · cached</text>

          {/* token strip */}
          {chips.map((c, i) => {
            const k = MASK_IDX.indexOf(i);
            const isTierWord = i - 1 >= 0 && MASK_IDX.includes(i - 1);
            const col = k >= 0 ? `var(--${TIERS[k]})` : isTierWord ? `var(--${TIERS[MASK_IDX.indexOf(i - 1)]})` : c.t === "request" ? "var(--text)" : "var(--muted)";
            return (
              <g key={i}>
                <rect x={c.x} y={STRIP_Y} width={c.w} height={26} fill="var(--panel)" stroke={k >= 0 ? col : "var(--line-2)"} strokeOpacity={k >= 0 ? 0.9 : 1} />
                <text className="ar-tok" x={c.cx} y={STRIP_Y + 16.5} fill={col}>{c.t}</text>
              </g>
            );
          })}
          <text className="ar-lab dim" x={X0} y={STRIP_Y + 42}>input · one sequence, three option slots</text>

          {/* logits → softmax */}
          {masks.map((c, k) => (
            <path key={k} className="ar-wire" d={`M${c.cx} ${HEAD_Y} C${c.cx} ${HEAD_Y - 70} ${SM_CX + (k - 1) * 34} ${SM.y + SM.h + 60} ${SM_CX + (k - 1) * 34} ${SM.y + SM.h + 2}`} stroke={`var(--${TIERS[k]})`} strokeOpacity={0.7} markerEnd="url(#ar-ah)" />
          ))}
          <text className="ar-lab dim" x={HEAD_R + 14} y={HEAD_Y - 6}>logits at [MASK]</text>
          <rect className="ar-box" x={SM.x} y={SM.y} width={SM.w} height={SM.h} />
          <text className="ar-lab c" x={SM_CX} y={SM.y + 17}>softmax</text>
          <path className="ar-wire" d={`M${SM.x + SM.w} ${SM.y + SM.h / 2} H${CX - 12}`} markerEnd="url(#ar-ah)" />
          <path d={`M${CX - 4} ${BAR_ROWS[0] - 10} H${CX - 8} V${BAR_ROWS[2] + 10} H${CX - 4}`} fill="none" stroke="var(--line-2)" />

          {/* policy bars (tracks) */}
          {TIERS.map((tr, k) => (
            <g key={tr}>
              <text className="ar-lab" x={CX} y={BAR_ROWS[k] + 4} fill={`var(--${tr})`} style={{ fill: `var(--${tr})` }}>{tr}</text>
              <rect x={TRACK.x} y={BAR_ROWS[k] - 6} width={TRACK.w} height={12} fill="none" stroke="var(--line-2)" />
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={TRACK.x + TRACK.w * f} x2={TRACK.x + TRACK.w * f} y1={BAR_ROWS[k] - 6} y2={BAR_ROWS[k] + 6} stroke="var(--line)" />
              ))}
            </g>
          ))}

          {/* routing */}
          <path className="ar-wire" d={`M1044 ${BAR_ROWS[2] + 8} V134 H876 V${TIER_Y[2] + TIER_H / 2}`} />
          <text className="ar-math" x={CX + CW} y={160} textAnchor="end">a ~ π(a|s)</text>
          {TIERS.map((tr, k) => (
            <g key={tr}>
              <path className="ar-wire" d={`M876 ${TIER_Y[k] + TIER_H / 2} H${CX - 2}`} markerEnd="url(#ar-ah)" />
              <rect className="ar-box" x={CX} y={TIER_Y[k]} width={CW} height={TIER_H} />
              <rect x={CX} y={TIER_Y[k]} width={3} height={TIER_H} fill={`var(--${tr})`} />
              <text className="ar-lab" x={CX + 16} y={TIER_Y[k] + 20} style={{ fill: `var(--${tr})` }}>{tr}</text>
              <text className="ar-lab dim" x={CX + 80} y={TIER_Y[k] + 20}>model tier</text>
            </g>
          ))}

          {/* grader / reward / update */}
          <path className="ar-wire" d={`M1152 ${TIER_Y[0] + TIER_H / 2} V${GRADER.y + GRADER.h / 2} H${CX + CW + 2}`} markerEnd="url(#ar-ah)" />
          {TIERS.map((tr, k) => (
            <line key={tr} x1={CX + CW} x2={1152} y1={TIER_Y[k] + TIER_H / 2} y2={TIER_Y[k] + TIER_H / 2} className="ar-wire" />
          ))}
          <rect className="ar-box" x={CX} y={GRADER.y} width={CW} height={GRADER.h} />
          <text className="ar-lab" x={CX + 14} y={GRADER.y + 15}>auto-grader</text>
          <text className="ar-lab dim sm" x={CX + 14} y={GRADER.y + 28}>math · tests · mc · agent tasks</text>
          <circle cx={CX + CW - 22} cy={GRADER.y + GRADER.h / 2} r={9.5} fill="none" stroke="var(--line-2)" />
          <path className="ar-wire" d={`M1015 ${GRADER.y + GRADER.h} V${REWARD.y - 2}`} markerEnd="url(#ar-ah)" />

          <rect className="ar-box" x={CX} y={REWARD.y} width={CW} height={REWARD.h} />
          <text className="ar-lab" x={CX + 14} y={REWARD.y + 16}>reward</text>
          <text className="ar-math lg" x={CX + 14} y={REWARD.y + 40}>
            r = <tspan className="ind">𝟙</tspan>[correct] − λ · cost / cost<tspan className="sub" dy={3}>ref</tspan>
          </text>
          <line x1={CX + 14} x2={CX + CW - 14} y1={REWARD.y + 50} y2={REWARD.y + 50} className="ar-hair" />
          <path className="ar-wire" d={`M1120 ${REWARD.y + REWARD.h} V${UPDATE.y - 2}`} markerEnd="url(#ar-ah)" />

          <rect x={CX} y={UPDATE.y} width={CW} height={UPDATE.h} fill="var(--panel)" stroke="var(--accent)" strokeOpacity={0.8} />
          <text className="ar-math lg acc" x={CX + 14} y={UPDATE.y + 25}>
            ∇<tspan className="sub" dy={3}>θ</tspan><tspan dy={-3}> log π(a|s) · (r − b)</tspan>
          </text>
          <text className="ar-lab dim sm" x={CX + 14} y={UPDATE.y + 45}>
            <tspan className="m">b</tspan> = running-mean baseline
          </text>

          {/* gradient return path: only into the trained params */}
          <path className="ar-grad ar-flowing" d={gradPath} />
          <path d={gradPath} fill="none" stroke="transparent" markerEnd="url(#ar-ahg)" />
          {TRAINED.map((b, j) => (
            <path key={j} className="ar-grad" d={`M${GX} ${b.y + b.h / 2} H${X1 + 3}`} markerEnd="url(#ar-ahg)" />
          ))}
          <text className="ar-math acc" transform={`translate(${GX + 20} ${(UPDATE.y + 29 + 340) / 2}) rotate(-90)`} textAnchor="middle">
            ∇θ → top 4 layers + head
          </text>
          <line x1={GX - 6} x2={GX + 6} y1={TRAINED[0].y + TRAINED[0].h + 8} y2={TRAINED[0].y + TRAINED[0].h + 8} stroke="var(--accent)" strokeOpacity={0.6} />

          {/* legend */}
          <g className="ar-leg">
            <line x1={CX} x2={CX + 22} y1={562} y2={562} stroke="var(--muted)" />
            <text className="ar-lab dim sm" x={CX + 30} y={565}>forward</text>
            <line x1={CX + 100} x2={CX + 122} y1={562} y2={562} stroke="var(--accent)" strokeDasharray="3 4" />
            <text className="ar-lab dim sm" x={CX + 130} y={565}>gradient</text>
            <rect x={CX} y={576} width={22} height={7} fill="url(#ar-hatch)" stroke="var(--line-2)" strokeWidth={0.75} />
            <text className="ar-lab dim sm" x={CX + 30} y={583}>frozen</text>
            <rect x={CX + 100} y={576} width={22} height={7} fill="none" stroke="var(--accent)" />
            <text className="ar-lab dim sm" x={CX + 130} y={583}>trained</text>
          </g>

          {/* ================= one animated training step (re-mounted per example) ================= */}
          <g key={reduce ? "s" : cycle} onAnimationEnd={(e) => { if ((e.target as Element).classList?.contains("ar-clock")) setCycle((c) => c + 1); }}>
            {!reduce && <rect className="ar-clock" x={0} y={0} width={1} height={1} style={anim(`ar-clock ${T}ms linear`)} />}

            {/* prompt text, typed */}
            <g clipPath="url(#ar-reqclip)">
              {ex.lines.map((ln, i, all) => {
                const cps = Math.min(24, 760 / all.join("").length); // ms per char: typing always ends before the packet leaves
                const y = 84 + i * 18;
                const start = t.type + all.slice(0, i).reduce((s, l) => s + l.length * cps, 0) + 60;
                const dur = ln.length * cps;
                return (
                  <g key={i} style={inOut(0, 10)}>
                    <text className="ar-req" x={32} y={y}>{ln}</text>
                    <g className="ar-anim" style={{ ["--w" as string]: `${ln.length * 6.62 + 10}px`, ...anim(`ar-type ${dur}ms steps(${ln.length}, end) ${start}ms both`) }}>
                      <rect x={31} y={y - 12} width={210} height={16} fill="var(--panel)" />
                      <rect x={31} y={y - 10} width={6} height={12} fill="var(--accent)" style={anim(`ar-in 1ms linear ${start}ms both`, i < ex.lines.length - 1 ? `ar-out 1ms linear ${start + dur + 30}ms forwards` : `ar-blink 1s steps(1) ${start + dur}ms infinite`)} />
                    </g>
                  </g>
                );
              })}
            </g>

            {/* forward pass */}
            <Pulse d="M130 148 V164" delay={t.p1} dur={260} />
            <Pulse d={`M40 194 V${STRIP_Y + 13} H${X0 - 3}`} delay={t.p2} dur={520} />
            {chips.map((c, i) => (
              <rect key={i} className="ar-fx" x={c.x} y={STRIP_Y} width={c.w} height={26} fill="rgba(232,235,241,.16)" style={flash(t.chips + i * 30)} />
            ))}
            {FROZEN.map((b, i) => (
              <rect key={i} className="ar-fx" x={X0} y={b.y} width={X1 - X0} height={b.h} fill="rgba(232,235,241,.28)" style={flash(t.sweep + i * 30, 420)} />
            ))}
            {TRAINED.map((b, j) => (
              <rect key={j} className="ar-fx" x={X0} y={b.y} width={X1 - X0} height={b.h} fill="rgba(232,235,241,.28)" style={flash(t.sweep + (24 + j) * 30, 420)} />
            ))}
            {masks.map((c, k) => (
              <g key={k}>
                <Pulse d={`M${c.cx} ${STRIP_Y} V${HEAD_Y + HEAD_H}`} delay={t.sweep} dur={880} color={`var(--${TIERS[k]})`} />
                <rect className="ar-fx" x={c.x} y={HEAD_Y} width={c.w} height={HEAD_H} fill={`var(--${TIERS[k]})`} fillOpacity={0.3} style={flash(t.head, 700)} />
                <Pulse d={`M${c.cx} ${HEAD_Y} C${c.cx} ${HEAD_Y - 70} ${SM_CX + (k - 1) * 34} ${SM.y + SM.h + 60} ${SM_CX + (k - 1) * 34} ${SM.y + SM.h + 2}`} delay={t.logits} dur={380} color={`var(--${TIERS[k]})`} />
              </g>
            ))}
            <rect className="ar-fx" x={SM.x} y={SM.y} width={SM.w} height={SM.h} fill="rgba(232,235,241,.14)" style={flash(t.softmax, 600)} />
            <Pulse d={`M${SM.x + SM.w} ${SM.y + SM.h / 2} H${CX - 12}`} delay={t.p5} dur={300} />

            {/* π(a|s) bars */}
            {TIERS.map((tr, k) => (
              <rect
                key={tr}
                className="ar-bar"
                x={TRACK.x}
                y={BAR_ROWS[k] - 6}
                width={TRACK.w}
                height={12}
                fill={`var(--${tr})`}
                fillOpacity={0.85}
                style={{ ["--p" as string]: ex.p[k], ...anim(`ar-grow 760ms ${E} ${t.bars + k * 60}ms both`, `ar-shrink 420ms ${E} ${OUT}ms forwards`) }}
              />
            ))}

            {/* sample → tier */}
            <Pulse d={samplePath} delay={t.sample} dur={440} />
            <g style={inOut(t.tier, 300)}>
              <rect x={CX} y={TIER_Y[ti]} width={CW} height={TIER_H} fill={`var(--${ex.tier})`} fillOpacity={0.1} stroke={`var(--${ex.tier})`} />
              <text className="ar-math" x={CX + CW - 16} y={TIER_Y[ti] + 21} textAnchor="end" style={{ fill: `var(--${ex.tier})` }}>a</text>
              <text className="ar-lab sm" x={CX + CW - 30} y={TIER_Y[ti] + 20} textAnchor="end" style={{ fill: `var(--${ex.tier})` }}>sampled</text>
            </g>

            {/* answer → grader */}
            <Pulse d={answerPath} delay={t.p7} dur={380} />
            <g transform={`translate(${CX + CW - 22} ${GRADER.y + GRADER.h / 2})`}>
              <g className="ar-pop" style={anim(`ar-pop 420ms ${E} ${t.grade}ms both`, `ar-out 450ms ${E} ${OUT}ms forwards`)}>
                <circle r={9.5} fill={ex.ok ? "var(--ok)" : "var(--bad)"} fillOpacity={0.12} stroke={ex.ok ? "var(--ok)" : "var(--bad)"} />
                <path d={ex.ok ? "M-4.2 0.2 L-1.2 3.2 L4.3 -3.4" : "M-3.4 -3.4 L3.4 3.4 M3.4 -3.4 L-3.4 3.4"} fill="none" stroke={ex.ok ? "var(--ok)" : "var(--bad)"} strokeWidth={1.6} strokeLinecap="round" />
              </g>
            </g>
            <text className="ar-lab sm" x={CX + CW - 40} y={GRADER.y + 15} textAnchor="end" style={{ ...inOut(t.grade + 120), fill: ex.ok ? "var(--ok)" : "var(--bad)" }}>
              {ex.ok ? "correct" : "wrong"}
            </text>

            {/* realised reward */}
            <Pulse d={`M1015 ${GRADER.y + GRADER.h} V${REWARD.y - 2}`} delay={t.grade + 150} dur={220} />
            <text className="ar-math" x={CX + 14} y={REWARD.y + 66} style={inOut(t.reward, 500)}>
              r = <tspan className="dig" style={{ fill: ex.ok ? "var(--ok)" : "var(--bad)" }}>{ex.ok ? "1" : "0"}</tspan> − λ · cost({ex.tier}) / cost<tspan className="sub" dy={3}>ref</tspan>
            </text>

            {/* backward: REINFORCE */}
            <Pulse d={`M1120 ${REWARD.y + REWARD.h} V${UPDATE.y - 2}`} delay={t.p8} dur={240} />
            <rect className="ar-fx" x={CX} y={UPDATE.y} width={CW} height={UPDATE.h} fill="var(--accent)" fillOpacity={0.12} style={flash(t.p8 + 200, 700)} />
            <Pulse d={gradPath} delay={t.grad} dur={t.gradDur} color="var(--accent)" w={2.4} />
            {TRAINED.map((b, j) => {
              const d0 = gradArrive(b.y + b.h / 2);
              return (
                <g key={j}>
                  <Pulse d={`M${GX} ${b.y + b.h / 2} H${X1 + 3}`} delay={d0} dur={180} color="var(--accent)" w={2.4} />
                  <rect className="ar-fx" x={X0} y={b.y} width={X1 - X0} height={b.h} fill="var(--accent)" fillOpacity={0.32} style={flash(d0 + 120, 900)} />
                </g>
              );
            })}
            {masks.map((c, k) => (
              <rect key={k} className="ar-fx" x={c.x} y={HEAD_Y} width={c.w} height={HEAD_H} fill="var(--accent)" fillOpacity={0.35} style={flash(t.grad + t.gradDur - 120 + (2 - k) * 50, 900)} />
            ))}
          </g>
        </svg>
      </div>

      <style jsx global>{`
        .ar-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
        .ar-scroll svg { display: block; width: 100%; height: auto; }
        @media (max-width: 760px) {
          .ar-scroll svg { width: 1040px; max-width: none; }
        }
        .ar text { font-family: var(--font-mono); }
        .ar .ar-sec text { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; fill: var(--muted); }
        .ar .ar-sec .n { fill: var(--accent); }
        .ar .m, .ar .ar-math { font-family: var(--font-serif); font-style: italic; letter-spacing: 0; text-transform: none; }
        .ar .ar-sec .m { font-size: 14px; fill: var(--text); }
        .ar .ar-note { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; fill: var(--dim); }
        .ar .ar-lab { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; fill: var(--muted); }
        .ar .ar-lab.sm { font-size: 9.5px; letter-spacing: 0.08em; }
        .ar .ar-lab.c { text-anchor: middle; }
        .ar .ar-lab.e { text-anchor: end; }
        .ar .ar-lab.dim { fill: var(--dim); }
        .ar .ar-lab.acc, .ar .ar-math.acc { fill: var(--accent); }
        .ar .ar-lab .m { font-size: 12.5px; fill: var(--muted); }
        .ar .ar-math { font-size: 14px; fill: var(--text); }
        .ar .ar-math.lg { font-size: 16px; }
        .ar .sub { font-size: 10px; }
        .ar .dig { font-family: var(--font-mono); font-style: normal; font-size: 12px; }
        .ar .ind { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", serif; font-style: normal; font-size: 0.92em; }
        .ar .ar-tok { font-size: 10px; text-anchor: middle; }
        .ar .ar-req { font-size: 11px; fill: var(--text); white-space: pre; }
        .ar .ar-box { fill: var(--panel); stroke: var(--line-2); }
        .ar .ar-hair { stroke: var(--line); }
        .ar .ar-wire { fill: none; stroke: var(--muted); stroke-opacity: 0.55; }
        .ar .ar-brk path { fill: none; }
        .ar .ar-grad { fill: none; stroke: var(--accent); stroke-opacity: 0.75; stroke-dasharray: 3 4; }
        .ar .ar-grad.ar-flowing { stroke-dasharray: 3 4; animation: ar-dash 2.4s linear infinite reverse; }

        /* animated layer */
        .ar .ar-pulse { fill: none; stroke-dasharray: 9 200; stroke-dashoffset: 9; stroke-linecap: round; opacity: 0; }
        .ar .ar-fx { opacity: 0; }
        .ar .ar-bar { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(var(--p)); }
        .ar .ar-pop { transform-box: fill-box; transform-origin: 50% 50%; }
        .ar-paused * { animation-play-state: paused !important; }
        .ar-static .ar-anim, .ar-static .ar-pulse, .ar-static .ar-fx { display: none; }
        .ar-static * { animation: none !important; }

        @keyframes ar-clock { from { opacity: 0; } to { opacity: 0; } }
        @keyframes ar-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ar-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes ar-flash { 0% { opacity: 0; } 22% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes ar-pulse { 0% { opacity: 1; stroke-dashoffset: 9; } 100% { opacity: 1; stroke-dashoffset: -100; } }
        @keyframes ar-grow { from { transform: scaleX(0); } to { transform: scaleX(var(--p)); } }
        @keyframes ar-shrink { from { transform: scaleX(var(--p)); } to { transform: scaleX(0); } }
        @keyframes ar-type { from { transform: translateX(0); } to { transform: translateX(var(--w)); } }
        @keyframes ar-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes ar-blink { 50% { opacity: 0; } }
        @keyframes ar-dash { to { stroke-dashoffset: -70; } }
      `}</style>
    </div>
  );
}
