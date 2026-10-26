"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ScaledCard } from "@/components/ShareCard";
import { Card, GameBody, int } from "@/lib/og";

function Game() {
  const q = useSearchParams();
  const n = int(q.get("n"), 1, 20, 10), you = int(q.get("you"), 0, n), laya = int(q.get("laya"), 0, n);
  return (
    <>
      <ScaledCard label={`You ${you} – ${laya} Laya`}><Card><GameBody you={you} laya={laya} /></Card></ScaledCard>
      <a className="btn primary" href="/#game">Play Beat the Router</a>
    </>
  );
}

export default function ShareGame() {
  return (
    <main className="wrap" style={{ padding: "64px var(--gutter)", display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
      <Suspense fallback={null}><Game /></Suspense>
    </main>
  );
}
