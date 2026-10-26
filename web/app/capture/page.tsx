"use client";
// Full-screen training timelapse for screen recording / Playwright capture.
// /capture?size=square (1080x1080) or /capture?size=wide (1920x1080, default). Set the browser window
// (or Playwright viewport) to that size; the galaxy loops through all checkpoints with the headline overlaid.
import PolicyGalaxy from "@/components/galaxy/PolicyGalaxy";

export default function Capture() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#05060a" }}>
      <PolicyGalaxy capture stepMs={420} />
    </div>
  );
}
