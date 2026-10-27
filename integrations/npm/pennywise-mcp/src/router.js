// The Pennywise router in Node: Laya tokenisation + the split ONNX graphs (shared lower trunk,
// one small upper graph per lambda). Mirrors router/onnx_serve.py; test/parity.test.js checks it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-node";
import { ASSETS, ensureWeights } from "./weights.js";

export const META = JSON.parse(readFileSync(join(ASSETS, "router_meta.json"), "utf8"));
export const ACTIONS = META.actions;
export const MODES = META.modes;

let _tok;
export function tokenizer() {
  if (!_tok) {
    const tj = JSON.parse(readFileSync(join(ASSETS, "tokenizer", "tokenizer.json"), "utf8"));
    const tc = JSON.parse(readFileSync(join(ASSETS, "tokenizer", "tokenizer_config.json"), "utf8"));
    _tok = new Tokenizer(tj, tc);
  }
  return _tok;
}

// Fixed routing question + prompt: head tokens are constant, the prompt is truncated to fit max_len.
export function buildIds(prompt) {
  const head = META.head_ids;
  const room = META.max_len - head.length - 1;
  const body = tokenizer().encode(String(prompt).split(META.mask_token).join(" "), { add_special_tokens: false }).ids;
  return [...head, ...body.slice(0, room), META.sep_token_id];
}

const lamFile = (lam) => `upper_lam${lam}.onnx`;

export class Router {
  static async load({ threads } = {}) {
    const paths = await ensureWeights();
    const opts = { graphOptimizationLevel: "all", intraOpNumThreads: threads || 0, executionProviders: ["cpu"] };
    const r = new Router();
    r.lower = await ort.InferenceSession.create(paths["lower.onnx"], opts);
    r.uppers = {};
    for (const lam of META.lambdas) {
      const f = lamFile(lam);
      if (paths[f]) r.uppers[lam] = await ort.InferenceSession.create(paths[f], opts);
    }
    r.lambdas = Object.keys(r.uppers).map(Number).sort((a, b) => a - b);
    return r;
  }

  nearest(lam) {
    return this.lambdas.reduce((best, x) => (Math.abs(x - lam) < Math.abs(best - lam) ? x : best), this.lambdas[0]);
  }

  async probs(prompt, lam) {
    const used = this.nearest(lam);
    const ids = buildIds(prompt);
    const L = ids.length;
    const inputIds = new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, L]);
    const att = new ort.Tensor("int64", new BigInt64Array(L).fill(1n), [1, L]);
    const { h } = await this.lower.run({ input_ids: inputIds, attention_mask: att });
    const mpos = new ort.Tensor("int64", BigInt64Array.from(META.markers, BigInt), [1, META.markers.length]);
    const mmask = new ort.Tensor("bool", new Uint8Array(META.markers.length).fill(1), [1, META.markers.length]);
    const out = await this.uppers[used].run({ h, attention_mask: att, marker_pos: mpos, marker_mask: mmask });
    return { p: Array.from(out.probs.data, Number), used, tokens: L };
  }

  // -> { tier, probabilities, confidence, lambda, mode, latency_ms, tokens }
  async route(prompt, mode = "auto") {
    const lam = MODES[mode] ?? MODES.auto;
    const t0 = performance.now();
    const { p, used, tokens } = await this.probs(prompt, lam);
    let a = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[a]) a = i;
    return {
      tier: ACTIONS[a],
      probabilities: Object.fromEntries(ACTIONS.map((k, i) => [k, +p[i].toFixed(4)])),
      confidence: +p[a].toFixed(4),
      lambda: used,
      mode: MODES[mode] === undefined ? "auto" : mode,
      latency_ms: Math.round(performance.now() - t0),
      tokens,
    };
  }
}
