"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { TIER_RGB, TIERS, type Umap } from "@/lib/data";
import { useVisible } from "./instrument";

export type GalaxyProps = {
  umap: Umap;
  action: number[] | null; // per-point chosen tier at the current checkpoint
  prob: number[] | null; // per-point probability of that tier
  onHover?: (i: number | null, x: number, y: number) => void;
  autoRotate?: boolean;
  onLowFps?: () => void;
};

const SCALE = 3.6;

const vert = /* glsl */ `
  attribute float size;
  uniform float uDpr;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uDpr * (440.0 / -mv.z), 1.5 * uDpr, 7.0 * uDpr); // capped: near points must not blow up
    vFade = clamp(1.3 - (-mv.z - 7.0) / 13.0, 0.3, 1.0); // depth cue
    gl_Position = projectionMatrix * mv;
  }`;
// crisp discs: hard edge with a 1px-ish antialiased rim, no additive haze
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = 1.0 - smoothstep(0.38, 0.5, d);
    vec3 col = min(vColor, vec3(1.0)) * (0.82 + 0.3 * (0.5 - d));
    gl_FragColor = vec4(col, a * vFade);
  }`;

function Points({ umap, action, prob, onHover }: GalaxyProps) {
  const ref = useRef<THREE.Points>(null);
  const n = umap.xyz.length;
  const { positions, base } = useMemo(() => {
    // robust per-axis scaling (2nd-98th percentile -> [-SCALE, SCALE]) so outliers don't shrink the galaxy
    const lim = [0, 1, 2].map((d) => {
      const v = umap.xyz.map((p) => p[d]).sort((a, b) => a - b);
      return [v[Math.floor(0.02 * (n - 1))], v[Math.floor(0.98 * (n - 1))]];
    });
    const p = new Float32Array(n * 3);
    umap.xyz.forEach((xyz, i) => p.set(xyz.map((v, d) => ((v - lim[d][0]) / (lim[d][1] - lim[d][0] || 1) * 2 - 1) * SCALE), i * 3));
    return { positions: p, base: new Float32Array(n * 3).fill(0.55) };
  }, [umap, n]);
  const colors = useMemo(() => base.slice(), [base]);
  const sizes = useMemo(() => new Float32Array(n).fill(0.12), [n]);
  const uniforms = useMemo(() => ({ uDpr: { value: typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio) : 1 } }), []);
  const target = useRef({ c: base.slice(), s: new Float32Array(n).fill(0.12) });
  const prev = useRef<number[] | null>(null);

  useEffect(() => {
    const c = target.current.c, s = target.current.s;
    // points whose chosen tier flipped since the last checkpoint flash white + swell, then tween back
    const g = ref.current?.geometry;
    if (g && prev.current && action) {
      const cc = (g.getAttribute("color") as THREE.BufferAttribute).array as Float32Array;
      const ss = (g.getAttribute("size") as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < n; i++)
        if (prev.current[i] !== action[i]) {
          cc.set([1.6, 1.6, 1.6], i * 3);
          ss[i] = 0.42;
        }
    }
    prev.current = action;
    for (let i = 0; i < n; i++) {
      const a = action ? action[i] : -1;
      const rgb = a >= 0 ? TIER_RGB[TIERS[a]] : [0.55, 0.58, 0.65];
      c.set(rgb, i * 3);
      const conf = prob ? prob[i] : 0.5;
      const test = umap.split[i] === "test";
      s[i] = (0.07 + 0.16 * conf) * (test ? 1.25 : 1);
    }
  }, [action, prob, n, umap.split]);

  useFrame((_, dt) => {
    const g = ref.current?.geometry;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 3.2); // smooth tween towards the checkpoint's colors
    const cA = g.getAttribute("color") as THREE.BufferAttribute;
    const sA = g.getAttribute("size") as THREE.BufferAttribute;
    const c = cA.array as Float32Array, s = sA.array as Float32Array;
    const tc = target.current.c, ts = target.current.s;
    for (let i = 0; i < c.length; i++) c[i] += (tc[i] - c[i]) * k;
    for (let i = 0; i < s.length; i++) s[i] += (ts[i] - s[i]) * k;
    cA.needsUpdate = true;
    sA.needsUpdate = true;
  });

  return (
    <points
      ref={ref}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover?.(e.index ?? null, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      }}
      onPointerOut={() => onHover?.(null, 0, 0)}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent depthWrite blending={THREE.NormalBlending} />
    </points>
  );
}

/** Measurement furniture: corner brackets of the [-S,S]^3 frame, ticks on three edges, and a goniometer ring below. */
function Furniture() {
  const geo = useMemo(() => {
    const v: number[] = [];
    const S = SCALE, b = 0.9;
    const seg = (a: number[], c: number[]) => v.push(...a, ...c);
    for (const x of [-S, S]) for (const y of [-S, S]) for (const z of [-S, S]) {
      seg([x, y, z], [x - Math.sign(x) * b, y, z]);
      seg([x, y, z], [x, y - Math.sign(y) * b, z]);
      seg([x, y, z], [x, y, z - Math.sign(z) * b]);
    }
    // ticks along the three edges meeting at (-S,-S,S)
    for (let i = 1; i < 10; i++) {
      const t = -S + i, L = i === 5 ? 0.3 : 0.15;
      seg([t, -S, S], [t, -S, S + L]);
      seg([-S, t, S], [-S - L, t, S]);
      seg([-S, -S, -t], [-S - L, -S, -t]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return g;
  }, []);
  const ring = useMemo(() => {
    const v: number[] = [];
    const R = 7.4, y = -SCALE - 0.6, N = 144;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      v.push(R * Math.cos(a0), y, R * Math.sin(a0), R * Math.cos(a1), y, R * Math.sin(a1));
    }
    for (let d = 0; d < 360; d += 5) {
      const a = (d / 180) * Math.PI, L = d % 30 === 0 ? 0.45 : 0.18;
      v.push(R * Math.cos(a), y, R * Math.sin(a), (R + L) * Math.cos(a), y, (R + L) * Math.sin(a));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return g;
  }, []);
  return (
    <>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color="#94a3b8" transparent opacity={0.32} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={ring}>
        <lineBasicMaterial color="#94a3b8" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
    </>
  );
}

type TriadRefs = { axes: RefObject<(SVGLineElement | null)[]>; labels: RefObject<(SVGTextElement | null)[]>; read: RefObject<HTMLSpanElement | null> };

/** Writes the camera orientation into the HTML triad + AZ/EL readout every frame (direct DOM, no React state). */
function CameraReadout({ axes, labels, read }: TriadRefs) {
  const { camera } = useThree();
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3(), last: "" }), []);
  useFrame(() => {
    tmp.q.copy(camera.quaternion).invert();
    for (let i = 0; i < 3; i++) {
      tmp.v.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(tmp.q);
      const x = 28 + tmp.v.x * 20, y = 28 - tmp.v.y * 20, op = (0.55 + 0.45 * (tmp.v.z * 0.5 + 0.5)).toFixed(2);
      const l = axes.current?.[i], t = labels.current?.[i];
      if (l) {
        l.setAttribute("x2", x.toFixed(1));
        l.setAttribute("y2", y.toFixed(1));
        l.setAttribute("opacity", op);
      }
      if (t) {
        t.setAttribute("x", (28 + tmp.v.x * 26).toFixed(1));
        t.setAttribute("y", (28 - tmp.v.y * 26).toFixed(1));
        t.setAttribute("opacity", op);
      }
    }
    const p = camera.position;
    const r = p.length() || 1;
    let az = (Math.atan2(p.x, p.z) * 180) / Math.PI;
    if (az < 0) az += 360;
    const el = (Math.asin(p.y / r) * 180) / Math.PI;
    const s = `AZ ${az.toFixed(0).padStart(3, "0")}° · EL ${el >= 0 ? "+" : "−"}${Math.abs(el).toFixed(0).padStart(2, "0")}° · R ${r.toFixed(1)}`;
    if (s !== tmp.last && read.current) {
      read.current.textContent = s;
      tmp.last = s;
    }
  });
  return null;
}

function FpsWatch({ onLowFps }: { onLowFps?: () => void }) {
  const st = useRef({ t: 0, frames: 0, done: false });
  useFrame((_, dt) => {
    const s = st.current;
    if (s.done) return;
    s.t += dt;
    if (s.t < 1) return; // ignore shader compile / first frames
    s.frames++;
    if (s.t > 3.5) {
      s.done = true;
      if (s.frames / (s.t - 1) < 40) onLowFps?.();
    }
  });
  return null;
}

function RaycastThreshold() {
  const { raycaster } = useThree();
  useEffect(() => {
    raycaster.params.Points = { threshold: 0.12 };
  }, [raycaster]);
  return null;
}

export default function Galaxy3D(props: GalaxyProps) {
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const visible = useVisible(wrap, false, "100px");
  const axes = useRef<(SVGLineElement | null)[]>([]);
  const labels = useRef<(SVGTextElement | null)[]>([]);
  const read = useRef<HTMLSpanElement | null>(null);
  return (
    <div ref={setWrap} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 3.2, 13.6], fov: 50 }}
        dpr={[1, 2]}
        frameloop={visible ? "always" : "never"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ touchAction: "pan-y" }}
      >
        <color attach="background" args={["#07080c"]} />
        <RaycastThreshold />
        <Furniture />
        <Points {...props} />
        <OrbitControls enablePan={false} autoRotate={props.autoRotate ?? true} autoRotateSpeed={0.45} minDistance={9} maxDistance={26} enableDamping />
        <CameraReadout axes={axes} labels={labels} read={read} />
        <FpsWatch onLowFps={props.onLowFps} />
      </Canvas>
      <div className="g3-triad" aria-hidden>
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(148,163,184,.18)" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1={28 + Math.cos(a) * 24} y1={28 + Math.sin(a) * 24} x2={28 + Math.cos(a) * (i % 3 ? 22.5 : 21)} y2={28 + Math.sin(a) * (i % 3 ? 22.5 : 21)} stroke="rgba(148,163,184,.35)" />;
          })}
          {[0, 1, 2].map((i) => (
            <line key={i} ref={(el) => { axes.current[i] = el; }} x1="28" y1="28" x2="28" y2="28" stroke={i === 0 ? "#e8ebf1" : i === 1 ? "#8a93a6" : "#facc15"} strokeWidth="1.25" />
          ))}
          <circle cx="28" cy="28" r="1.5" fill="#e8ebf1" />
          {["U1", "U2", "U3"].map((t, i) => (
            <text key={t} ref={(el) => { labels.current[i] = el; }} x="28" y="28" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={i === 2 ? "#facc15" : "#8a93a6"} style={{ fontFamily: "var(--font-mono)" }}>
              {t}
            </text>
          ))}
        </svg>
        <span ref={read} className="g3-read">AZ 000° · EL +00°</span>
      </div>
      <style jsx>{`
        .g3-triad { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 8px; pointer-events: none; }
        .g3-triad svg { overflow: visible; }
        .g3-read { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; order: -1; }
        @media (max-width: 560px) { .g3-read { display: none; } }
      `}</style>
    </div>
  );
}
