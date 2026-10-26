// Typed loaders for the static JSON exported by eval/export_viz.py.
// NEXT_PUBLIC_DATA_DIR=/data-synthetic during development before real results exist.

export const DATA_DIR = process.env.NEXT_PUBLIC_DATA_DIR || "/data";

export const TIERS = ["small", "medium", "large"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_COLOR: Record<Tier, string> = {
  small: "#2dd4bf",
  medium: "#818cf8",
  large: "#f472b6",
};
export const TIER_RGB: Record<Tier, [number, number, number]> = {
  small: [0.176, 0.831, 0.749],
  medium: [0.506, 0.549, 0.973],
  large: [0.957, 0.447, 0.714],
};
export const OK = "#4ade80";
export const BAD = "#f87171";

export type Manifest = {
  synthetic: boolean;
  commit: string | null;
  seed: number;
  tiers: Tier[];
  lambdas: number[];
  modes: Record<"auto" | "auto-cheap" | "auto-quality", number>;
  n_test: number;
  n_prompts: number;
  jev: string;
  tier_models?: Record<Tier, { model: string; price_in_per_m: number; price_out_per_m: number }>;
  headline: {
    lambda: number;
    accuracy: number;
    accuracy_ci: [number, number];
    cost_vs_large: number;
    cost_vs_large_ci: [number, number];
    large_accuracy: number;
    router_latency_ms: number | null;
    medium_accuracy?: number;
    medium_cost_vs_large?: number;
    vs_large_diff?: number;
    vs_large_ci?: [number, number];
  };
  measured_savings: { usd: number; requests: number; label: string };
};

export type PromptRow = { id: string; source: string; preview: string; correct: number[]; cost: number[] };

export type Umap = {
  ids: string[];
  split: string[];
  source: string[];
  preview: string[];
  xyz: [number, number, number][];
  xy: [number, number][];
};

export type SplitMetrics = { accuracy: number; mean_cost_usd: number; cost_vs_large: number; reward: number };
export type Checkpoint = {
  step: number;
  train_reward_ma: number | null;
  val: SplitMetrics;
  test: SplitMetrics;
  action: number[];
  prob: number[];
};
export type Training = { lambda: number; checkpoints: Checkpoint[] };

export type ParetoPoint = {
  name: string;
  kind: string;
  lambda: number | null;
  accuracy: number;
  accuracy_ci: [number, number];
  cost_vs_large: number;
  cost_vs_large_ci: [number, number];
  mean_cost_usd: number;
  router_latency_ms: number | null;
  action_share: number[];
  on_pareto_front?: boolean;
};

export type RouterActions = {
  "always-large": number[];
  "zero-shot": number[];
  sft?: number[];
  rl: Record<string, number[]>;
};

export type GameRound = {
  id: string;
  source: string;
  prompt: string;
  oracle: Tier;
  router: Tier;
  router_conf: number;
  correct: number[];
  cost: number[];
};
export type Game = { lambda: number; rounds: GameRound[]; router_right_share: number };

export type FallbackExample = {
  prompt: string;
  probs: Record<Tier, number>;
  action: Tier;
  router_latency_ms: number;
  answer: string;
  cost_usd: number;
  large_cost_usd: number;
  lambda: number;
};

const cache = new Map<string, Promise<unknown>>();
export function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`${DATA_DIR}/${name}`).then((r) => {
        if (!r.ok) throw new Error(`${name}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(name) as Promise<T>;
}

export const lamKey = (l: number) => String(+l.toFixed(4));

export const SOURCE_LABEL: Record<string, string> = {
  gsm8k: "Math (GSM8K)",
  math: "Hard math (MATH L4-5)",
  mmlu_pro: "Hard QA (MMLU-Pro)",
  arc: "Science QA (ARC)",
  mbpp: "Code (MBPP)",
  alan_bugfix: "Agent: bug fix",
  alan_triage: "Agent: CI triage",
};

export const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;
export const usd = (x: number) => (x >= 0.01 ? `$${x.toFixed(2)}` : `$${x.toFixed(x >= 0.0001 ? 4 : 6)}`);
