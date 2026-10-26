import { ImageResponse } from "next/og";
import { Card, clean, int, num, TIER_HEX, tierOf } from "@/lib/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const tier = tierOf(q.get("tier"));
  const ms = int(q.get("ms"), 0, 60000);
  const conf = int(q.get("conf"), 0, 100);
  const saved = num(q.get("saved"), 0, 100);
  const p = clean(q.get("p"));
  const savedTxt = saved >= 0.01 ? `$${saved.toFixed(2)}` : `$${saved.toFixed(4)}`;
  return new ImageResponse(
    (
      <Card accent={TIER_HEX[tier]}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 28, color: "#8b93a7", letterSpacing: 4, textTransform: "uppercase" }}>Routing decision</div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -3 }}>
            Routed to&nbsp;<span style={{ color: TIER_HEX[tier] }}>{tier.toUpperCase()}</span>
          </div>
          <div style={{ display: "flex", gap: 36, fontSize: 40, color: "#cbd5e1" }}>
            <span>{ms} ms</span>
            <span>{conf}% confident</span>
            <span style={{ color: "#facc15" }}>saved {savedTxt} vs large</span>
          </div>
          {p && (
            <div style={{ fontSize: 30, color: "#8b93a7", borderLeft: "4px solid #334155", paddingLeft: 20, maxHeight: 130, overflow: "hidden" }}>
              “{p}”
            </div>
          )}
        </div>
      </Card>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
