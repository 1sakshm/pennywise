// pennywise-mcp: stdio MCP server exposing the Pennywise router as tools.
//   route       - which tier (small / medium / large) a request needs, from the RL-trained Laya router
//   ask_routed  - route, then answer with that tier's open model (NVIDIA API, your NVIDIA_API_KEY)
// stdout carries MCP JSON-RPC only; every log line goes to stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Router, MODES } from "./router.js";
import { progress } from "./weights.js";

export const VERSION = "0.1.1";

const BASE_URL = (process.env.PENNYWISE_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
export const TIERS = {
  small: process.env.PENNYWISE_SMALL_MODEL || "nvidia/nemotron-3.5-bolt-e4b",
  medium: process.env.PENNYWISE_MEDIUM_MODEL || "openai/gpt-oss-20b",
  large: process.env.PENNYWISE_LARGE_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
};
// List price per 1M tokens (in, out), as in config/models.yaml; used for the cost estimate only.
const PRICE = { small: [0.04, 0.05], medium: [0.018, 0.09], large: [0.6, 2.4] };
const TIMEOUT_MS = Number(process.env.PENNYWISE_TIMEOUT_S || 120) * 1000;

const log = (...a) => process.stderr.write(`[pennywise] ${a.join(" ")}\n`);

let router = null;
let loadError = null;
let loading = null;
export function startLoading() {
  loading ||= Router.load()
    .then((r) => {
      router = r;
      log(`router ready (lambdas ${r.lambdas.join(", ")})`);
    })
    .catch((e) => {
      loadError = e;
      log(`router failed to load: ${e.message}`);
    });
  return loading;
}

function notReady() {
  if (loadError) return `Pennywise router failed to load: ${loadError.message}`;
  const pct = progress.total ? Math.floor((100 * progress.done) / progress.total) : 0;
  return progress.state === "downloading"
    ? `Pennywise is warming up: downloading router weights (${pct}% of ${(progress.total / 1e9).toFixed(1)} GB, first run only). Try again shortly.`
    : "Pennywise is warming up: loading the router. Try again in a few seconds.";
}

// Waits briefly for the router so the first call after start-up usually just works.
async function getRouter(waitMs = 45000) {
  if (!router && !loadError && progress.state !== "downloading") {
    await Promise.race([loading, new Promise((r) => setTimeout(r, waitMs))]);
  }
  return router;
}

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

async function chat(tier, messages, maxTokens) {
  const key = process.env.NVIDIA_API_KEY || process.env.PENNYWISE_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set. Add it to this connector's environment (free key: build.nvidia.com).");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: TIERS[tier], messages, max_tokens: maxTokens, temperature: 0.2 }),
      signal: ctl.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${TIERS[tier]}: HTTP ${res.status} ${body.slice(0, 200)}`);
    const j = JSON.parse(body);
    const answer = (j.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error(`${TIERS[tier]}: empty reply`);
    return { answer, usage: j.usage || {} };
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`${TIERS[tier]}: timed out after ${TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const modeSchema = z
  .enum(Object.keys(MODES))
  .default("auto")
  .describe("auto (balanced), auto-quality (prefer stronger tiers), auto-cheap (prefer cheaper tiers)");

export function createServer() {
  const server = new McpServer({ name: "pennywise", version: VERSION });

  server.registerTool(
    "route",
    {
      title: "Pennywise: pick a model tier",
      description:
        "Decide which model tier (small, medium or large) a request needs, using Pennywise's RL-trained open decision model (runs locally, ~0.2 s on CPU). Returns the tier, its open model id, and the router's probabilities.",
      inputSchema: { prompt: z.string().min(1).describe("The request or task to route"), mode: modeSchema },
    },
    async ({ prompt, mode }) => {
      const r = await getRouter();
      if (!r) return fail(notReady());
      const d = await r.route(prompt, mode);
      return text({ ...d, model: TIERS[d.tier] });
    },
  );

  server.registerTool(
    "ask_routed",
    {
      title: "Pennywise: answer with the routed model",
      description:
        "Route the prompt with Pennywise, then answer it with that tier's open model on the NVIDIA API (needs NVIDIA_API_KEY). Escalates to the large tier if the cheaper model errors or returns nothing.",
      inputSchema: {
        prompt: z.string().min(1).describe("The question or task to answer"),
        mode: modeSchema,
        system: z.string().optional().describe("Optional system prompt"),
        max_tokens: z.number().int().min(16).max(16384).default(2048),
      },
    },
    async ({ prompt, mode, system, max_tokens }) => {
      const r = await getRouter();
      if (!r) return fail(notReady());
      const d = await r.route(prompt, mode);
      const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
      let tier = d.tier;
      let escalated = null;
      let out;
      const t0 = performance.now();
      try {
        out = await chat(tier, messages, max_tokens);
      } catch (e) {
        if (tier === "large") return fail(String(e.message));
        escalated = { from: tier, reason: String(e.message).slice(0, 200) };
        tier = "large";
        try {
          out = await chat(tier, messages, max_tokens);
        } catch (e2) {
          return fail(String(e2.message));
        }
      }
      const u = out.usage;
      const [pi, po] = PRICE[tier];
      const cost = ((u.prompt_tokens || 0) * pi + (u.completion_tokens || 0) * po) / 1e6;
      const meta = {
        routed_to: d.tier,
        answered_by: tier,
        model: TIERS[tier],
        router_confidence: d.confidence,
        escalated,
        tokens: { in: u.prompt_tokens, out: u.completion_tokens },
        list_price_usd: +cost.toFixed(6),
        seconds: +((performance.now() - t0) / 1000).toFixed(2),
      };
      return { content: [{ type: "text", text: out.answer }, { type: "text", text: "pennywise: " + JSON.stringify(meta) }] };
    },
  );

  return server;
}

export async function main() {
  startLoading();
  const server = createServer();
  await server.connect(new StdioServerTransport());
  log(`pennywise-mcp ${VERSION} on stdio`);
}
