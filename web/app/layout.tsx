import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { StoreProvider } from "@/components/Store";
import "./globals.css";

const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Laya Router — Jev chooses. This one learns.",
  description:
    "An open decision model trained with reinforcement learning to route every LLM request to the cheapest model that gets it right. Watch it learn, beat it, or plug it in with one line.",
  openGraph: { images: ["/api/og/site"], type: "website" },
  twitter: { card: "summary_large_image", images: ["/api/og/site"] },
};

export const viewport: Viewport = { themeColor: "#05060a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${mono.variable}`}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
