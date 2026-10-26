"use client";
// Small animation primitives shared across sections. All respect prefers-reduced-motion.
import { animate, motion, useInView, useMotionValue, useReducedMotion as useFmReduced, useScroll, useSpring } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fade + rise when scrolled into view (once). */
export function Reveal({ children, delay = 0, y = 14 }: { children: ReactNode; delay?: number; y?: number }) {
  const reduce = useFmReduced();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}
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
          initial={reduce ? false : { opacity: 0, y: "0.35em" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: delay + i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
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

/** Numbered section header: "§02 — POLICY GALAXY" rule, then the title (may contain <em>). */
export function SectionHead({ n, kicker, title, lede, meta }: { n: string; kicker: string; title: ReactNode; lede?: ReactNode; meta?: ReactNode }) {
  return (
    <Reveal>
      <div className="sh">
        <div className="sh-rule">
          <span className="sh-n">§{n}</span>
          <span className="sh-k">{kicker}</span>
          <span className="sh-line" />
          {meta && <span className="sh-meta">{meta}</span>}
        </div>
        <h2>{title}</h2>
        {lede && <p className="lede">{lede}</p>}
      </div>
      <style jsx>{`
        .sh-rule { display: flex; align-items: center; gap: 12px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
        .sh-n { color: var(--accent); }
        .sh-k { color: var(--muted); }
        .sh-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--line-2), transparent); }
        .sh-meta { color: var(--dim); letter-spacing: 0.08em; }
        @media (max-width: 600px) { .sh-meta { display: none; } }
      `}</style>
    </Reveal>
  );
}

/** 2px reading-progress bar along the top edge. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });
  return <motion.div className="progress" style={{ scaleX }} aria-hidden />;
}

/** Inertial smooth scrolling (Lenis). Off for reduced motion and touch (native is better there). */
export function SmoothScroll() {
  const reduce = useFmReduced();
  useEffect(() => {
    if (reduce || matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let dead = false;
    import("lenis").then(({ default: Lenis }) => {
      if (dead) return;
      const l = new Lenis({ duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 4), anchors: true });
      lenis = l;
      const loop = (t: number) => { l.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    });
    return () => { dead = true; cancelAnimationFrame(raf); lenis?.destroy(); };
  }, [reduce]);
  return null;
}

/** Ask the galaxy to replay training from step 0 (used by "Watch it learn"). */
export function playGalaxy() {
  document.getElementById("galaxy-view")?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.dispatchEvent(new CustomEvent("galaxy:play"));
}
