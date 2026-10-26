# Pennywise web — design spec

Direction: **research instrument / lab notebook**. The page should feel like a live figure from a
paper rendered by a precise piece of software — measured, annotated, quiet — not a SaaS landing
page. Everything is earned by data; decoration is limited to measurement marks.

## Never
- Glow orbs, blurred colour blobs, aurora gradients, neon box-shadows, hover glows on panels
  (the user explicitly rejected these as "vibe coded").
- Pill-shaped everything, emoji, gradient borders, glassmorphism blur stacks.
- Animating layout properties (width/height/top/left) — animate `transform` and `opacity` only
  (SVG: `stroke-dashoffset`, `opacity`, transforms). No animation should drop below 60 fps.
- Inventing numbers. Every number comes from the data JSON (`useData`, `useStore`).

## Type (tokens live on `body`)
- `--font-sans`: Geist — UI, body, headings. Headings weight 500–600, tight tracking (-0.03em).
- `--font-mono`: Geist Mono — labels, axis ticks, numbers, code, figure captions.
  Labels: 11px, uppercase, letter-spacing .12em, colour `--muted`.
  Numbers: `font-variant-numeric: tabular-nums`.
- `--font-serif`: Instrument Serif (italic) — math variables and the occasional emphasised
  word in headings (e.g. *learns*). Use class `.math` for inline math: π(a|s), λ, r.

## Colour tokens (globals.css)
`--bg #06070a`, `--bg-2 #0a0c11`, `--panel #0b0d12`, `--line rgba(148,163,184,.12)`,
`--line-2 rgba(148,163,184,.22)`, `--text #e8ebf1`, `--muted #8a93a6`, `--dim #5a6274`,
tiers `--small #2dd4bf`, `--medium #818cf8`, `--large #f472b6`, `--accent #facc15` (the single
highlight colour), `--ok #4ade80`, `--bad #f87171`.

## Primitives (all in globals.css — use them, don't re-invent)
- `.panel` — 1px hairline border, radius 4px, solid `--panel`, with registration ticks drawn at
  the four corners (`.panel` already has them via pseudo-elements; add class `.ticks-off` to drop).
- `.fig-head` — strip at the top of a panel: `<div class="fig-head"><span class="fig-id">FIG. 2</span><span>POLICY GALAXY</span><span class="led"/>…</div>`.
  Mono 11px uppercase, bottom hairline.
- `.fig-cap` — caption under a figure, mono 12px muted: "Fig. 2 — …".
- `.btn` (radius 4px, mono 12px uppercase), `.btn.primary`, `.seg` (segmented control, radius 4px).
- `.chip` (radius 3px), `.stat` (`.v` value mono, `.k` label), `.kbd`.
- `.grid-bg` — engineering grid (minor 24px, major 120px) — already on `body`.
- `.math` — serif italic.

## Charts (SVG / canvas)
- Axes: 1px `--line-2`, ticks 4px outward, tick labels Geist Mono 10–11px `--dim`.
- Gridlines `--line` dashed `2 4`. Axis titles mono uppercase 10px with units, e.g. `COST / ALWAYS-LARGE →`.
- Data marks: tier colours; CI as thin whiskers with 4px caps; bands at 12–15% opacity.
- Annotate directly on the chart (leader lines) instead of legends where possible.
- Crosshair / hover readouts in a small mono tooltip with hairline border.

## Motion
- Easing: `cubic-bezier(.2,.8,.2,1)` (ease-out-quint-ish); durations 300–900ms.
- Entrance: opacity 0→1 + translateY 12px→0, staggered 40–60ms. Use `Reveal` from `fx.tsx`.
- Continuous motion (data flowing through diagrams): SVG dash-offset or rAF transforms, slow
  (2–6 s loops), low amplitude. Pause when off-screen (IntersectionObserver) and honour
  `prefers-reduced-motion` (`useReducedMotion` from Store or framer-motion).
- Numbers tick with `CountUp`.

## Layout
- `.wrap` max 1180px, gutter `clamp(16px,4vw,40px)`. Must work at 375px width with no
  horizontal scroll.
- Sections use `<SectionHead n="02" kicker="Policy galaxy" title=… />` from `components/fx.tsx`.
