"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getHealth, type Health, type LiveStatus } from "@/lib/api";
import { load, type Manifest } from "@/lib/data";

type Store = {
  manifest: Manifest | null;
  lambda: number;
  setLambda: (l: number) => void;
  health: Health | null;
  live: LiveStatus;
  refreshHealth: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [lambda, setLambda] = useState(0.25);
  const [health, setHealth] = useState<Health | null>(null);
  const [live, setLive] = useState<LiveStatus>("checking");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    load<Manifest>("manifest.json")
      .then((m) => {
        setManifest(m);
        setLambda(m.modes.auto);
      })
      .catch(() => setManifest(null));
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const h = await getHealth();
      if (!alive) return;
      setHealth(h);
      setLive(h && h.models_loaded && !h.over_cap ? "live" : "fallback");
    };
    check();
    const id = setInterval(check, 30000); // keeps the savings counter fresh with real totals
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tick]);

  const value = useMemo(
    () => ({ manifest, lambda, setLambda, health, live, refreshHealth: () => setTick((t) => t + 1) }),
    [manifest, lambda, health, live],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}

export function useData<T>(name: string): T | null {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    load<T>(name)
      .then((x) => alive && setD(x))
      .catch(() => alive && setD(null));
    return () => {
      alive = false;
    };
  }, [name]);
  return d;
}

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const h = () => setR(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return r;
}

export function useIsMobile(bp = 760) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp || matchMedia("(pointer: coarse)").matches);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}
