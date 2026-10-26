import { ImageResponse } from "next/og";
import { Card } from "@/lib/og";

export const dynamic = "force-static"; // rendered once at build time -> out/og.png

export async function GET() {
  return new ImageResponse(
    (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: "#8b93a7", letterSpacing: 4, textTransform: "uppercase" }}>Open decision model · RL-trained LLM router</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
            <span>Jev chooses.</span>
            <span style={{ color: "#facc15" }}>This one learns.</span>
          </div>
          <div style={{ fontSize: 36, color: "#cbd5e1" }}>Watch it learn · beat it · plug it in with one line</div>
        </div>
      </Card>
    ),
    { width: 1200, height: 630 },
  );
}
