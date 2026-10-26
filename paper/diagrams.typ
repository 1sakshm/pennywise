// Vector diagrams for the Pennywise technical report (CeTZ 0.3.4).
//   #figure(system-diagram(), caption: [...])                       -- one column (~8.4 cm)
//   #figure(training-diagram(), placement: top, scope: "parent", ...) -- full page width (~17 cm)
// Both functions draw at a fixed nominal size and are then scaled uniformly (text included)
// to `width`, so they always fit the container. No result numbers appear in either figure.
#import "@preview/cetz:0.3.4"

// ---- palette & style ---------------------------------------------------------------
#let _ink = luma(20)
#let _grey = luma(115)
#let _rule = luma(170)
#let _faint = luma(246)
#let _c-small = rgb("#0d9488")
#let _c-medium = rgb("#4f46e5")
#let _c-large = rgb("#db2777")
#let _c-hl = rgb("#ca8a04")
#let _th = 0.6pt
#let _serif = ("New Computer Modern", "Libertinus Serif")
#let _mono = ("DejaVu Sans Mono",)

#let _tint(c, amount: 90%) = c.lighten(amount)
#let _sc(body) = smallcaps(body)
#let _tt(body, size: 5.6pt, fill: _ink) = text(font: _mono, size: size, fill: fill, body)
#let _small(body, fill: _ink) = text(size: 6.2pt, fill: fill, body)
#let _hatch = tiling(size: (2.6pt, 2.6pt), {
  place(line(start: (0pt, 2.6pt), end: (2.6pt, 0pt), stroke: 0.35pt + luma(175)))
})

// Scale content uniformly so its width equals `width` (resolved against the container).
#let _fit(width, body) = block(width: width, breakable: false, layout(size => {
  let m = measure(body)
  scale(size.width / m.width * 100%, reflow: true, body)
}))

// Stroke / arrow helpers (no names leaked into importers' namespace except the `_` ones).
#let _st(col: _ink, dash: none, th: _th) = (paint: col, thickness: th, dash: dash)
#let _arrow(..pts, col: _ink, dash: none, th: _th) = cetz.draw.line(
  ..pts, stroke: _st(col: col, dash: dash, th: th),
  mark: (end: "stealth", fill: col, stroke: (paint: col, thickness: 0.4pt), scale: 0.42),
)
#let _box(a, b, fill: white, col: _ink, dash: none, radius: 0.06, th: _th, name: none) = cetz.draw.rect(
  a, b, fill: fill, stroke: _st(col: col, dash: dash, th: th), radius: radius, name: name,
)
#let _txt(pos, body, anchor: "center", ..args) = cetz.draw.content(pos, body, anchor: anchor, ..args)

// ======================================================================================
// 1. Serving system (single column)
// ======================================================================================
#let system-diagram(width: 100%) = _fit(width, {
  set text(font: _serif, size: 7pt, fill: _ink)
  set par(justify: false, leading: 0.45em)
  cetz.canvas(length: 1cm, {
    import cetz.draw: *
    let L = 0.75 // left edge of main column (return lane lives left of it)
    let R = 8.4
    let lane = 0.3

    // -- clients ---------------------------------------------------------------------
    _box((L, 0), (5.0, -1.0), fill: _faint)
    _txt((L + 0.15, -0.16), anchor: "north-west", _sc[Agent / application])
    _txt((L + 0.15, -0.55), anchor: "north-west", _small(fill: _grey)[OpenAI SDK · OpenCode · Alan])

    _box((5.65, 0), (R, -1.0), dash: "dashed", col: _grey)
    _txt((5.8, -0.16), anchor: "north-west", _sc[MCP server] + text(fill: _grey, size: 6pt)[ (opt.)])
    _txt((5.8, -0.55), anchor: "north-west", _tt(fill: _grey)[route · ask_routed])
    _arrow((5.0, -0.5), (5.65, -0.5), col: _grey, dash: "dashed")

    // -- proxy -----------------------------------------------------------------------
    let py = -1.55
    _arrow((2.875, -1.0), (2.875, py))
    _txt((2.975, -1.27), anchor: "west", _small(fill: _grey)[request])
    _arrow((7.025, -1.0), (7.025, py), col: _grey, dash: "dashed")

    _box((L, py), (R, py - 1.55))
    _txt((L + 0.15, py - 0.16), anchor: "north-west", _sc[OpenAI-compatible proxy])
    _txt((R - 0.15, py - 0.19), anchor: "north-east", _tt[POST /v1/chat/completions])
    let chips = (
      ([sticky session per conversation], (L + 0.15, py - 0.62)),
      ([tool-call passthrough], (4.65, py - 0.62)),
      ([rate limit], (L + 0.15, py - 1.04)),
      ([spend cap], (4.65, py - 1.04)),
    )
    for (lbl, p) in chips {
      let (x, y) = p
      _box((x, y), (x + 3.6, y - 0.34), fill: _faint, col: _rule, th: 0.4pt, radius: 0.05)
      _txt((x + 0.12, y - 0.17), anchor: "west", _small(lbl))
    }

    // -- router ----------------------------------------------------------------------
    let ry = py - 2.05
    _arrow((4.575, py - 1.55), (4.575, ry))
    _txt((4.675, py - 1.8), anchor: "west", _small(fill: _grey)[messages + mode])

    _box((L, ry), (R, ry - 1.75), col: _ink, th: 0.9pt)
    _txt((L + 0.15, ry - 0.16), anchor: "north-west", _sc[Laya router])
    _txt((L + 0.15, ry - 0.58), anchor: "north-west", _small[one forward pass #sym.arrow.r $pi_theta (a | s)$])
    _txt((L + 0.15, ry - 0.98), anchor: "north-west", _small[mode #sym.arrow.r.bar $lambda$:])
    _txt((L + 0.15, ry - 1.33), anchor: "north-west",
      _tt[auto] + _small(fill: _grey)[ · ] + _tt[auto-cheap] + _small(fill: _grey)[ · ] + _tt[auto-quality])

    // mini policy bar chart (illustrative shape only)
    let bx = 6.35
    let base = ry - 1.38
    let bars = ((_c-small, 0.62, "S"), (_c-medium, 0.95, "M"), (_c-large, 0.34, "L"))
    line((bx - 0.12, base), (bx + 1.78, base), stroke: _st(col: _grey, th: 0.4pt))
    for (i, b) in bars.enumerate() {
      let (c, h, l) = b
      let x0 = bx + i * 0.58
      rect((x0, base), (x0 + 0.38, base + h), fill: _tint(c, amount: 55%), stroke: _st(col: c, th: 0.5pt))
      _txt((x0 + 0.19, base - 0.05), anchor: "north", text(size: 5.6pt, fill: c)[#l])
    }
    _txt((bx + 0.83, ry - 0.06), anchor: "north", text(size: 6.4pt)[$pi_theta (dot | s)$])

    // -- tiers -----------------------------------------------------------------------
    let ty = ry - 2.35
    let split = (4.575, ry - 2.02)
    line((4.575, ry - 1.75), split, stroke: _st(col: _grey))
    _txt((4.68, ry - 1.89), anchor: "west", _small(fill: _grey)[dispatch to one tier])
    let tiers = (
      ([small], _c-small, L, 3.2),
      ([medium], _c-medium, 3.35, 5.8),
      ([large], _c-large, 5.95, R),
    )
    for (lbl, c, x0, x1) in tiers {
      let xm = (x0 + x1) / 2
      _arrow(split, (xm, ty), col: _grey)
      _box((x0, ty), (x1, ty - 0.62), fill: _tint(c, amount: 90%), col: c)
      _txt((xm, ty - 0.31), text(fill: c.darken(15%))[#_sc(lbl) #text(size: 6pt, fill: _grey)[endpoint]])
    }

    // -- response --------------------------------------------------------------------
    let oy = ty - 1.1
    let merge = (4.575, ty - 0.88)
    for (lbl, c, x0, x1) in tiers {
      line(((x0 + x1) / 2, ty - 0.62), merge, stroke: _st(col: _grey))
    }
    _arrow(merge, (4.575, oy), col: _grey)
    _box((L, oy), (R, oy - 1.18))
    _txt((L + 0.15, oy - 0.16), anchor: "north-west", _sc[Response + routing headers])
    let hdrs = ("x-router-tier", "x-router-confidence", "x-router-latency-ms", "x-estimated-savings-usd")
    for (i, h) in hdrs.enumerate() {
      let x = if calc.rem(i, 2) == 0 { L + 0.15 } else { 4.65 }
      let y = oy - 0.58 - calc.floor(i / 2) * 0.32
      _txt((x, y), anchor: "north-west", _tt(h))
    }

    // -- return lane -----------------------------------------------------------------
    _arrow((L, oy - 0.59), (lane, oy - 0.59), (lane, -0.5), (L, -0.5))
    _txt((lane, (oy - 0.59 - 0.5) / 2), angle: 90deg,
      box(fill: white, inset: (x: 2pt, y: 1pt), _small(fill: _grey)[response]))
  })
})

// ======================================================================================
// 2. Learning pipeline (full page width)
// ======================================================================================
#let training-diagram(width: 100%) = _fit(width, {
  set text(font: _serif, size: 7pt, fill: _ink)
  set par(justify: false, leading: 0.45em)
  let panel(lbl, title) = text(size: 7.4pt)[*(#lbl)* #_sc(title)]
  cetz.canvas(length: 1cm, {
    import cetz.draw: *

    // ---------------------------------------------------------------- (a) data
    _txt((0, 0), anchor: "north-west", panel("a")[Outcome data])
    _box((0, -0.55), (3.9, -1.95), fill: _faint)
    _txt((0.14, -0.67), anchor: "north-west", [*948 prompts* #text(size: 5.8pt, fill: _grey)[· all 3 tiers each]])
    _txt((0.14, -1.0), anchor: "north-west", box(width: 3.7cm, text(size: 6pt, std.grid(
      columns: (1fr, 1fr), row-gutter: 2.4pt,
      [GSM8K], [MBPP],
      [MATH L4–5], [agent bug-fix],
      [ARC-Challenge], [CI triage],
      [MMLU-Pro], [],
    ))))

    let tier-chips = (([small], _c-small, 0.0), ([medium], _c-medium, 1.35), ([large], _c-large, 2.7))
    for (lbl, c, x) in tier-chips {
      _arrow((1.95, -1.95), (x + 0.6, -2.35), col: _grey)
      _box((x, -2.35), (x + 1.2, -2.72), fill: _tint(c), col: c)
      _txt((x + 0.6, -2.535), text(size: 6.4pt, fill: c.darken(15%), _sc(lbl)))
      line((x + 0.6, -2.72), (1.95, -3.0), stroke: _st(col: _grey))
    }
    _box((0.15, -3.0), (3.75, -3.36), col: _ink)
    _txt((1.95, -3.18), text(size: 6.4pt)[automatic graders + token cost])
    _arrow((1.95, -3.36), (1.95, -3.62))

    // outcome table (illustrative ✓/✗ pattern that defines the oracle label)
    let ok = text(fill: _ink)[✓]
    let no = text(fill: luma(160))[✗]
    let a(l, c) = text(fill: c, weight: "bold", _sc(l))
    _txt((1.95, -3.62), anchor: "north", text(size: 6.4pt, table(
      columns: 5, align: center + horizon, stroke: none, inset: (x: 5pt, y: 1.9pt),
      table.hline(stroke: 0.6pt),
      [], text(fill: _c-small)[$S$], text(fill: _c-medium)[$M$], text(fill: _c-large)[$L$],
      table.cell(fill: _tint(_c-hl, amount: 85%))[$a^star$],
      table.hline(stroke: 0.35pt),
      [$x_1$], ok, ok, ok, table.cell(fill: _tint(_c-hl, amount: 85%), a("s", _c-small)),
      [$x_2$], no, ok, ok, table.cell(fill: _tint(_c-hl, amount: 85%), a("m", _c-medium)),
      [$x_3$], no, no, ok, table.cell(fill: _tint(_c-hl, amount: 85%), a("l", _c-large)),
      [$dots.v$], [], [], [], table.cell(fill: _tint(_c-hl, amount: 85%))[],
      table.hline(stroke: 0.6pt),
    )))
    _txt((1.95, -5.12), anchor: "north", text(size: 5.8pt, fill: _grey)[(correct $y$, cost $c$) per (prompt, tier)])

    // ---------------------------------------------------------------- (b) Laya
    let bx = 4.45
    _txt((bx, 0), anchor: "north-west", panel("b")[Laya policy] + text(size: 7.4pt)[ $pi_theta$] +
      text(size: 6.2pt, fill: _grey)[  ModernBERT-large · 28 layers])
    let toks = (
      ("[CLS]", none, "sp"), ("question", none, "it"), ("[SEP]", none, "sp"),
      ("[MASK]", _c-small, "sp"), ("small", _c-small, "op"),
      ("[MASK]", _c-medium, "sp"), ("medium", _c-medium, "op"),
      ("[MASK]", _c-large, "sp"), ("large", _c-large, "op"),
      ("[SEP]", none, "sp"), ("request", none, "it"), ("[SEP]", none, "sp"),
    )
    let pitch = 0.335
    let y0 = -0.9
    let rowy(i) = y0 - i * pitch
    let top = rowy(0) + 0.19
    let bot = rowy(11) - 0.19
    let tx0 = bx
    let tx1 = bx + 1.12
    let ex0 = 6.0      // encoder: frozen block
    let ex1 = 8.7
    let gx0 = 8.82     // trained layers
    let sw = 0.135
    let sg = 0.03
    let gx1 = gx0 + 4 * sw + 3 * sg
    for (i, t) in toks.enumerate() {
      let (s, c, kind) = t
      let y = rowy(i)
      let col = if c == none { _rule } else { c }
      let fill = if kind == "sp" and c != none { _tint(c, amount: 88%) } else if kind == "sp" { _faint } else { white }
      _box((tx0, y + 0.135), (tx1, y - 0.135), fill: fill, col: col, th: 0.45pt, radius: 0.04)
      let body = if kind == "it" { text(size: 6.4pt, style: "italic")[#s] }
        else if kind == "op" { _tt(size: 5.4pt, fill: c.darken(10%), s) }
        else { _tt(size: 5.4pt, s) }
      _txt(((tx0 + tx1) / 2, y), body)
      line((tx1 + 0.05, y), (ex0 - 0.05, y), stroke: _st(col: _rule, th: 0.4pt),
        mark: (end: "stealth", fill: _rule, scale: 0.3))
    }
    // frozen stack (hatched, 24 thin layers)
    rect((ex0, top), (ex1, bot), fill: _hatch, stroke: _st(col: _grey))
    let lw = (ex1 - ex0) / 24
    for k in range(1, 24) {
      line((ex0 + k * lw, top), (ex0 + k * lw, bot), stroke: _st(col: luma(195), th: 0.3pt))
    }
    // trained top-4 layers (highlight)
    for k in range(4) {
      let x = gx0 + k * (sw + sg)
      rect((x, top), (x + sw, bot), fill: _tint(_c-hl, amount: 80%), stroke: _st(col: _c-hl, th: 0.7pt))
    }
    line((ex1, (top + bot) / 2), (gx0, (top + bot) / 2), stroke: _st(col: _grey, th: 0.4pt))
    // labels under the stack
    let lby = bot - 0.1
    line((ex0, lby), (ex0, lby - 0.07), (ex1, lby - 0.07), (ex1, lby), stroke: _st(col: _grey, th: 0.45pt))
    _txt(((ex0 + ex1) / 2, lby - 0.12), anchor: "north", align(center, text(size: 6pt)[
      layers 1–24: *frozen* \ #text(fill: _grey)[$h^((24))$ computed once, cached]]))
    line((gx0, lby), (gx0, lby - 0.07), (gx1, lby - 0.07), (gx1, lby), stroke: _st(col: _c-hl, th: 0.6pt))
    _txt(((gx0 + gx1) / 2 + 0.02, lby - 0.12), anchor: "north", align(center, text(size: 6pt, fill: _c-hl.darken(25%))[
      25–28 \ *trained*]))

    // decision head over the three [MASK] rows
    let hx0 = 9.78
    let hx1 = 10.18
    let mask-rows = ((3, _c-small, "S"), (5, _c-medium, "M"), (7, _c-large, "L"))
    rect((hx0, rowy(3) + 0.2), (hx1, rowy(7) - 0.2), fill: _tint(_c-hl, amount: 88%),
      stroke: _st(col: _c-hl, th: 0.8pt), radius: 0.05)
    _txt(((hx0 + hx1) / 2, (rowy(3) + rowy(7)) / 2), angle: 90deg, text(size: 6.2pt)[decision head])
    let px0 = 10.62
    let plen = (0.42, 0.78, 0.26)
    for (j, m) in mask-rows.enumerate() {
      let (r, c, l) = m
      let y = rowy(r)
      _arrow((gx1 + 0.03, y), (hx0, y), col: c, th: 0.7pt)
      _arrow((hx1, y), (px0 - 0.04, y), col: c, th: 0.6pt)
      _txt(((hx1 + px0) / 2, y + 0.04), anchor: "south", text(size: 5.4pt, fill: c)[$z_#l$])
      rect((px0, y + 0.1), (px0 + plen.at(j), y - 0.1), fill: _tint(c, amount: 55%), stroke: _st(col: c, th: 0.5pt))
    }
    line((px0, rowy(3) + 0.18), (px0, rowy(7) - 0.18), stroke: _st(col: _grey, th: 0.45pt))
    _txt((px0 + 0.02, rowy(3) + 0.22), anchor: "south-west", text(size: 6.4pt)[$pi_theta (a | s)$])
    _txt((px0 + 0.02, rowy(7) - 0.2), anchor: "north-west", text(size: 5.6pt, fill: _grey)[softmax])

    // ---------------------------------------------------------------- (c) training
    let cx0 = 12.0
    let cx1 = 16.55
    let cxm = (cx0 + cx1) / 2
    _txt((cx0, 0), anchor: "north-west", panel("c")[Two-stage training])
    // stage 1
    _box((cx0, -0.72), (cx1, -1.9))
    _txt((cx0 + 0.14, -0.84), anchor: "north-west", text(size: 7pt)[*Stage 1* #h(2pt) #_sc[supervised warm start]])
    _txt((cx0 + 0.14, -1.2), anchor: "north-west", text(size: 7pt)[$cal(L)_"SFT" = -log pi_theta (a^star | s)$])
    _txt((cx0 + 0.14, -1.56), anchor: "north-west", text(size: 6pt, fill: _grey)[$a^star$: cheapest correct tier (oracle label)])
    _arrow((cxm, -1.9), (cxm, -2.22))
    _txt((cxm + 0.1, -2.06), anchor: "west", text(size: 5.8pt, fill: _grey)[init $theta$, copy per $lambda$])
    // stage 2
    let s2t = -2.22
    let s2b = -5.3
    _box((cx0, s2t), (cx1, s2b))
    _txt((cx0 + 0.14, s2t - 0.12), anchor: "north-west", text(size: 7pt)[*Stage 2* #h(2pt) #_sc[reinforce], one policy per $lambda$])
    let circ(n) = box(baseline: 15%, std.circle(radius: 3.6pt, stroke: 0.5pt + _ink, inset: 0pt,
      align(center + horizon, text(size: 5.4pt)[#n])))
    let steps = (
      (-2.78, [sample $a tilde pi_theta (dot | s)$]),
      (-3.3, [$r = bb(1)[y_a] - lambda thin c(a) \/ c_"ref"$]),
      (-3.98, [$cal(L) = -(r - b) log pi_theta (a|s) - beta thin cal(H)(pi_theta)$]),
    )
    for (n, st) in steps.enumerate() {
      let (y, body) = st
      _txt((cx0 + 0.25, y), circ(n + 1))
      _txt((cx0 + 0.45, y), anchor: "west", text(size: 6.8pt, body))
    }
    _txt((cx0 + 0.45, -3.58), anchor: "west", text(size: 5.8pt, fill: _grey)[outcome of the sampled arm only])
    line((cx0 + 0.14, -4.32), (cx1 - 0.14, -4.32), stroke: _st(col: _rule, th: 0.35pt))
    _txt((cx0 + 0.14, -4.4), anchor: "north-west", text(size: 5.9pt, fill: _grey)[
      $b$: running mean of $r$ (baseline) \
      $beta$: entropy weight, annealed \
      $c_"ref"$: mean always-large cost (train)])
    // policy feeds the sampler
    _arrow((px0 + 0.86, -2.78), (cx0, -2.78))

    // gradient path (dashed highlight) into the trained layers + head only
    let gl = -0.5
    let gsp = 16.82
    let gs = _st(col: _c-hl, dash: "dashed", th: 0.8pt)
    line((cx1, -3.98), (gsp, -3.98), (gsp, gl), stroke: gs)
    line((cx1, -1.3), (gsp, -1.3), stroke: gs)
    line((gsp, gl), ((gx0 + gx1) / 2, gl), stroke: gs)
    _arrow(((gx0 + gx1) / 2, gl), ((gx0 + gx1) / 2, top + 0.02), col: _c-hl, dash: "dashed", th: 0.8pt)
    _arrow(((hx0 + hx1) / 2, gl), ((hx0 + hx1) / 2, rowy(3) + 0.2), col: _c-hl, dash: "dashed", th: 0.8pt)
    _txt((10.3, gl - 0.1), anchor: "north-west", text(size: 6pt, fill: _c-hl.darken(25%))[$nabla_theta cal(L)$ only into \ top 4 layers \ + head])

    // ---------------------------------------------------------------- data lane (a) -> (c)
    let dl = -5.78
    line((1.95, -5.45), (1.95, dl), (cxm, dl), stroke: _st(col: _ink))
    _arrow((cxm, dl), (cxm, s2b))
    _txt((10.9, dl), box(fill: white, inset: (x: 3pt, y: 1pt),
      text(size: 6pt)[train split: labels $a^star$ (stage 1), rewards $r$ (stage 2)]))

    // ---------------------------------------------------------------- (d) selection
    let dy = -6.22
    _txt((0, dy), anchor: "north-west", panel("d")[Data use & selection])
    let sx0 = 3.75
    let sx1 = 16.55
    let seg = (sx1 - sx0) / 5
    let segs = (
      (sx0, sx0 + 3 * seg, [train 60 %], _faint, _grey,
        [SFT and REINFORCE updates (stages 1–2)]),
      (sx0 + 3 * seg, sx0 + 4 * seg, [validation 20 %], _tint(_c-hl, amount: 85%), _c-hl,
        [chosen on val. reward: \ checkpoint, $lambda$ per mode]),
      (sx0 + 4 * seg, sx1, [test 20 %], white, _ink,
        [held out; evaluated once \ for the reported numbers]),
    )
    for (x0, x1, lbl, f, c, desc) in segs {
      rect((x0, dy - 0.02), (x1, dy - 0.36), fill: f, stroke: _st(col: c, th: 0.6pt))
      _txt(((x0 + x1) / 2, dy - 0.19), text(size: 6.4pt)[#lbl])
      _txt((x0 + 0.06, dy - 0.45), anchor: "north-west", box(width: (x1 - x0 - 0.1) * 1cm,
        text(size: 5.9pt, fill: _grey, desc)))
    }
  })
})
