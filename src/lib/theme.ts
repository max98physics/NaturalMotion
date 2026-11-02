import { useEffect, useState } from "react";

export interface Palette {
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  invalid: string;
  s1: string;
  s2: string;
  s3: string;
  critical: string;
  good: string;
  divNeg: string;
  divMid: string;
  divPos: string;
  mapNone: string;
  dark: boolean;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    invalid: v("--invalid"),
    s1: v("--series-1"),
    s2: v("--series-2"),
    s3: v("--series-3"),
    critical: v("--critical"),
    good: v("--good"),
    divNeg: v("--div-neg"),
    divMid: v("--div-mid"),
    divPos: v("--div-pos"),
    mapNone: v("--map-none"),
    dark: css.getPropertyValue("color-scheme").trim() === "dark",
  };
}

/** Chart colors from the CSS tokens; updates when the OS theme changes. */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPalette(readPalette());
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return palette;
}

/** Hex color with alpha. */
export function alpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Linear interpolation between two hex colors -> [r, g, b]. */
export function mix(a: string, b: string, t: number): [number, number, number] {
  const pa = parseInt(a.replace("#", ""), 16);
  const pb = parseInt(b.replace("#", ""), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  return [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t)) as [number, number, number];
}
