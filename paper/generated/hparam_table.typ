// GENERATED — do not edit
#table(columns: 2, align: (left, left), stroke: none, inset: (x: 3pt, y: 2.4pt),
  table.hline(),
  [Encoder], [ModernBERT-large, 28 layers, 421M params (Laya)],
  [Trainable], [top 4 layers + decision head],
  [SFT], [lr 2e-05, batch 8×2, ≤10 epochs, patience 3],
  [RL], [REINFORCE, 800 steps, batch 16, lr 5e-06],
  [Baseline b], [running mean, momentum 0.95],
  [Entropy β], [0.05 → 0.005 (linear)],
  [λ grid], [0, 0.1, 0.25, 0.5, 1, 2],
  [Selection], [best val reward (checked every 40 steps)],
  [Bootstrap], [1000 resamples, seed 0],
  [Hardware], [1× RTX 3050 Laptop (4 GB), bf16],
  table.hline())
