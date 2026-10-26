// Dynamic share image (server deploys only; ignored by the static export, see next.config.ts).
import { ImageResponse } from "next/og";
import { Card, GameBody, int } from "@/lib/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const n = int(q.get("n"), 1, 20, 10);
  return new ImageResponse(
    <Card><GameBody you={int(q.get("you"), 0, n)} laya={int(q.get("laya"), 0, n)} /></Card>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
