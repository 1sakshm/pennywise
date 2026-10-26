import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds a fully static site into out/ (Cloudflare Pages). Files named
// *.dyn.tsx (the dynamic share-image routes) are only routes on a server build; in the static
// build they don't match pageExtensions and are ignored, and the share pages render client-side.
const STATIC = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: STATIC ? "export" : undefined,
  distDir: STATIC ? "out" : ".next", // export lands here; keeps the dev server's .next untouched
  images: { unoptimized: STATIC },
  pageExtensions: STATIC ? ["tsx", "ts"] : ["dyn.tsx", "tsx", "ts"],
};

export default nextConfig;
