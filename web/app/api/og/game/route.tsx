import { ImageResponse } from "next/og";
import { Card, int } from "@/lib/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const n = int(q.get("n"), 1, 20, 10);
  const you = int(q.get("you"), 0, n);
  const laya = int(q.get("laya"), 0, n);
  const verdict = you > laya ? "I beat the router." : you === laya ? "Dead heat with the router." : "The router beat me.";
  return new ImageResponse(
    (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 28, color: "#8b93a7", letterSpacing: 4, textTransform: "uppercase" }}>Beat the Router</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, fontSize: 150, fontWeight: 800, letterSpacing: -4 }}>
            <span>You {you}</span>
            <span style={{ color: "#5b6377" }}>–</span>
            <span style={{ color: "#facc15" }}>{laya} Laya</span>
          </div>
          <div style={{ fontSize: 40 }}>{verdict} Can you pick the cheapest LLM that still gets it right?</div>
        </div>
      </Card>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
