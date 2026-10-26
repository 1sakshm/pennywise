"use client";
// Small animation primitives shared across sections. All respect prefers-reduced-motion.
import { animate, motion, useInView, useMotionValue, useReducedMotion as useFmReduced } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fade + rise when scrolled into view (once). */
export function Reveal({ children, delay = 0, y = 24 }: { children: ReactNode; delay?: number; y?: number }) {
  const reduce = useFmReduced();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word headline reveal. */
export function StaggerWords({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useFmReduced();
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          style={{ display: "inline-block", whiteSpace: "pre" }}
          initial={reduce ? false : { opacity: 0, y: "0.45em", filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, delay: delay + i * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {w + (i < text.split(" ").length - 1 ? " " : "")}
        </motion.span>
      ))}
    </span>
  );
}

/** Number that counts from 0 (or its previous value) to `value` when visible. */
export function CountUp({ value, format, duration = 1.2 }: { value: number; format: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [txt, setTxt] = useState(format(0));
  const reduce = useFmReduced();
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setTxt(format(value));
      return;
    }
    const c = animate(mv, value, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setTxt(format(v)) });
    return () => c.stop();
  }, [inView, value, duration, format, mv, reduce]);
  return <span ref={ref}>{txt}</span>;
}

/** Confetti burst in tier colours (pure DOM, ~40 particles). */
export function Burst({ trigger, colors = ["#2dd4bf", "#818cf8", "#f472b6", "#facc15"] }: { trigger: number; colors?: string[] }) {
  const reduce = useFmReduced();
  if (!trigger || reduce) return null;
  return (
    <div key={trigger} aria-hidden style={{ position: "absolute", left: "50%", top: "50%", pointerEvents: "none", zIndex: 5 }}>
      {Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
        const d = 80 + Math.random() * 160;
        return (
          <motion.span
            key={i}
            style={{ position: "absolute", width: 7, height: 7, borderRadius: i % 3 ? 2 : 7, background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 60, opacity: 0, scale: 0.6, rotate: 360 * (Math.random() - 0.5) }}
            transition={{ duration: 1.1 + Math.random() * 0.4, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

/** Ask the galaxy to replay training from step 0 (used by "Watch it learn"). */
export function playGalaxy() {
  document.getElementById("galaxy-view")?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.dispatchEvent(new CustomEvent("galaxy:play"));
}
