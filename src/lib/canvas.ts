import { useCallback, useEffect, useRef, useState } from "react";

export interface CanvasSize {
  w: number;
  h: number;
}

/**
 * Canvas sized by CSS (width 100%, height from the aspect ratio), drawn at
 * device pixel ratio. `context()` returns a cleared 2D context in CSS pixels.
 */
export function useCanvas(aspect: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      setSize({ w, h: Math.round(w / aspect) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const context = useCallback(() => {
    const el = ref.current;
    if (!el || size.w === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(size.w * dpr) || el.height !== Math.round(size.h * dpr)) {
      el.width = Math.round(size.w * dpr);
      el.height = Math.round(size.h * dpr);
      el.style.height = `${size.h}px`;
    }
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    return ctx;
  }, [size]);

  return { ref, size, context };
}

/** Calls `frame(dtSeconds)` on every animation frame while `running` is true. */
export function useAnimationLoop(running: boolean, frame: (dt: number) => void) {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frameRef.current(dt);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running]);
}

/** True while the element is on screen, so off-screen animations can pause. */
export function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
