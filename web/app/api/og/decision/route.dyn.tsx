// Dynamic share image (server deploys only; ignored by the static export, see next.config.ts).
import { ImageResponse } from "next/og";
import { Card, clean, DecisionBody, int, num, TIER_HEX, tierOf } from "@/lib/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const tier = tierOf(q.get("tier"));
  return new ImageResponse(
    <Card accent={TIER_HEX[tier]}>
      <DecisionBody tier={tier} ms={int(q.get("ms"), 0, 60000)} conf={int(q.get("conf"), 0, 100)} saved={num(q.get("saved"), 0, 100)} p={clean(q.get("p"))} />
    </Card>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
