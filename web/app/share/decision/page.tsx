"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ScaledCard } from "@/components/ShareCard";
import { Card, clean, DecisionBody, int, num, TIER_HEX, tierOf } from "@/lib/og";

function Decision() {
  const q = useSearchParams();
  const tier = tierOf(q.get("tier"));
  return (
    <>
      <ScaledCard label="Routing decision card">
        <Card accent={TIER_HEX[tier]}>
          <DecisionBody tier={tier} ms={int(q.get("ms"), 0, 60000)} conf={int(q.get("conf"), 0, 100)} saved={num(q.get("saved"), 0, 100)} p={clean(q.get("p"))} />
        </Card>
      </ScaledCard>
      <a className="btn primary" href="/#live">Route your own request</a>
    </>
  );
}

export default function ShareDecision() {
  return (
    <main className="wrap" style={{ padding: "64px var(--gutter)", display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
      <Suspense fallback={null}><Decision /></Suspense>
    </main>
  );
}
