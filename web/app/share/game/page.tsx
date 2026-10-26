import type { Metadata } from "next";
import { int } from "@/lib/og";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const n = int(one(sp.n), 1, 20, 10), you = int(one(sp.you), 0, n), laya = int(one(sp.laya), 0, n);
  const img = `/api/og/game?you=${you}&laya=${laya}&n=${n}`;
  const title = `I scored ${you} vs Laya's ${laya} — can you beat the router?`;
  return {
    title,
    description: "Pick the cheapest LLM that still gets each request right. An RL-trained open decision model is your opponent.",
    openGraph: { title, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [img] },
  };
}

export default async function ShareGame({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const n = int(one(sp.n), 1, 20, 10), you = int(one(sp.you), 0, n), laya = int(one(sp.laya), 0, n);
  return (
    <main className="wrap" style={{ padding: "64px var(--gutter)", display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/og/game?you=${you}&laya=${laya}&n=${n}`} alt={`You ${you} – ${laya} Laya`} style={{ width: "100%", maxWidth: 900, borderRadius: 14, border: "1px solid var(--line)" }} />
      <a className="btn primary" href="/#game">Play Beat the Router</a>
    </main>
  );
}
