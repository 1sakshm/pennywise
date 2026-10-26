// Live server client. Every call has a timeout and a typed failure so the UI can fall back
// to recorded runs instead of showing an error, a spinner forever, or a blank panel.

import type { Tier } from "./data";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export const PROXY_URL = API_URL ? `${API_URL}/v1` : "https://YOUR-DEPLOYMENT/v1";

export type Health = {
  ok: boolean;
  models_loaded: boolean;
  router_mode: string | null;
  lambdas: number[];
  modes: Record<string, number>;
  spend_today: number;
  spend_cap: number;
  over_cap: boolean;
  stats: { requests_routed: number; savings_usd: number; by_tier: Record<string, number>; since: string };
};

export type LiveStatus = "checking" | "live" | "fallback";

async function withTimeout(input: string, init: RequestInit = {}, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function getHealth(): Promise<Health | null> {
  if (!API_URL) return null;
  try {
    const r = await withTimeout(`${API_URL}/health`, {}, 4000);
    if (!r.ok) return null;
    return (await r.json()) as Health;
  } catch {
    return null;
  }
}

export type RouteResult = { action: Tier; probs: Record<Tier, number>; router_latency_ms: number; lambda_used: number | null };

export async function route(prompt: string, lambda: number): Promise<RouteResult | { error: string }> {
  try {
    const r = await withTimeout(
      `${API_URL}/route`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, lambda }) },
      8000,
    );
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.status || `http_${r.status}` };
    return j as RouteResult;
  } catch {
    return { error: "unreachable" };
  }
}

export type AnswerDone = {
  cost_usd: number;
  large_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  usage_measured: boolean;
};

/** Streams the tier's answer via SSE. Resolves with the final cost event, or an error string. */
export async function streamAnswer(
  prompt: string,
  tier: Tier,
  onDelta: (s: string) => void,
): Promise<AnswerDone | { error: string }> {
  try {
    const r = await withTimeout(
      `${API_URL}/answer`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, tier }) },
      60000,
    );
    if (!r.ok || !r.body) {
      const j = await r.json().catch(() => ({}));
      return { error: j.status || `http_${r.status}` };
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let done: AnswerDone | null = null;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const p of parts) {
        if (!p.startsWith("data:")) continue;
        const ev = JSON.parse(p.slice(5));
        if (ev.delta) onDelta(ev.delta);
        if (ev.error) return { error: ev.error };
        if (ev.done) done = ev;
      }
    }
    return done ?? { error: "stream ended early" };
  } catch {
    return { error: "unreachable" };
  }
}
