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

export type Theme = "light" | "dark";

/** The chosen theme (data-theme on <html>), else the OS setting. */
function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Calls back when the OS theme or the chosen theme changes; returns the unsubscribe. */
function onThemeChange(update: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(update);
  mq.addEventListener("change", update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", update);
    observer.disconnect();
  };
}

/** Current theme and a setter that overrides the OS setting and remembers the choice. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => onThemeChange(() => setTheme(currentTheme())), []);
  const choose = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      // storage blocked: the choice lasts until reload
    }
  };
  return [theme, choose];
}

/** Chart colors from the CSS tokens; updates when the theme changes. */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => onThemeChange(() => setPalette(readPalette())), []);
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
