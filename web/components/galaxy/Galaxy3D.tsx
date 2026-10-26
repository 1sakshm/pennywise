"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TIER_RGB, TIERS, type Umap } from "@/lib/data";

export type GalaxyProps = {
  umap: Umap;
  action: number[] | null; // per-point chosen tier at the current checkpoint
  prob: number[] | null; // per-point probability of that tier
  onHover?: (i: number | null, x: number, y: number) => void;
  autoRotate?: boolean;
  onLowFps?: () => void;
};

const SCALE = 6;

const vert = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mv.z);
    vFade = clamp(1.25 - (-mv.z - 6.0) / 14.0, 0.25, 1.0); // depth fog
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.55 + 0.9 * a) * vFade, a * vFade);
  }`;

function Points({ umap, action, prob, onHover }: GalaxyProps) {
  const ref = useRef<THREE.Points>(null);
  const n = umap.xyz.length;
  const { positions, base } = useMemo(() => {
    const p = new Float32Array(n * 3);
    umap.xyz.forEach(([x, y, z], i) => p.set([x * SCALE, y * SCALE, z * SCALE], i * 3));
    return { positions: p, base: new Float32Array(n * 3).fill(0.55) };
  }, [umap, n]);
  const colors = useMemo(() => base.slice(), [base]);
  const sizes = useMemo(() => new Float32Array(n).fill(0.12), [n]);
  const target = useRef({ c: base.slice(), s: new Float32Array(n).fill(0.12) });

  useEffect(() => {
    const c = target.current.c, s = target.current.s;
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
    const k = 1 - Math.exp(-dt * 5); // smooth tween towards the checkpoint's colors
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
      <shaderMaterial vertexShader={vert} fragmentShader={frag} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function FpsWatch({ onLowFps }: { onLowFps?: () => void }) {
  const st = useRef({ t: 0, frames: 0, done: false });
  useFrame((_, dt) => {
    const s = st.current;
    if (s.done) return;
    s.t += dt;
    s.frames++;
    if (s.t > 2.5) {
      s.done = true;
      if (s.frames / s.t < 40) onLowFps?.();
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
  return (
    <Canvas camera={{ position: [0, 2, 13], fov: 50 }} dpr={[1, 1.75]} gl={{ antialias: false, powerPreference: "high-performance" }}>
      <color attach="background" args={["#05060a"]} />
      <RaycastThreshold />
      <Points {...props} />
      <OrbitControls enablePan={false} autoRotate={props.autoRotate ?? true} autoRotateSpeed={0.5} minDistance={5} maxDistance={24} enableDamping />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.15} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
      <FpsWatch onLowFps={props.onLowFps} />
    </Canvas>
  );
}
