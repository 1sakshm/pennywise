import type { Metadata } from "next";
import { clean, int, num, tierOf } from "@/lib/og";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

function params(sp: Awaited<SP>) {
  const q = new URLSearchParams({
    tier: tierOf(one(sp.tier)),
    ms: String(int(one(sp.ms), 0, 60000)),
    conf: String(int(one(sp.conf), 0, 100)),
    saved: String(num(one(sp.saved), 0, 100)),
    p: clean(one(sp.p)),
  });
  return q;
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const q = params(await searchParams);
  const img = `/api/og/decision?${q}`;
  const title = `Routed to ${q.get("tier")!.toUpperCase()} in ${q.get("ms")} ms · ${q.get("conf")}% confident`;
  return {
    title,
    description: "An open decision model, trained with RL, picks the cheapest LLM that will still get the request right.",
    openGraph: { title, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [img] },
  };
}

export default async function ShareDecision({ searchParams }: { searchParams: SP }) {
  const q = params(await searchParams);
  return (
    <main className="wrap" style={{ padding: "64px var(--gutter)", display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/og/decision?${q}`} alt="Routing decision card" style={{ width: "100%", maxWidth: 900, borderRadius: 14, border: "1px solid var(--line)" }} />
      <a className="btn primary" href="/#live">Route your own request</a>
    </main>
  );
}
