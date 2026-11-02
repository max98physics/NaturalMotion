import type { Palette } from "./theme";

/** Data window mapped onto a pixel rectangle. */
export interface Frame {
  x: [number, number];
  y: [number, number];
  left: number;
  top: number;
  width: number;
  height: number;
}

export function makeFrame(
  w: number,
  h: number,
  x: [number, number],
  y: [number, number],
  margin = { left: 52, right: 12, top: 12, bottom: 40 },
): Frame {
  return {
    x,
    y,
    left: margin.left,
    top: margin.top,
    width: Math.max(1, w - margin.left - margin.right),
    height: Math.max(1, h - margin.top - margin.bottom),
  };
}

export const sx = (f: Frame, v: number) => f.left + ((v - f.x[0]) / (f.x[1] - f.x[0])) * f.width;
export const sy = (f: Frame, v: number) => f.top + (1 - (v - f.y[0]) / (f.y[1] - f.y[0])) * f.height;
export const invX = (f: Frame, px: number) => f.x[0] + ((px - f.left) / f.width) * (f.x[1] - f.x[0]);
export const invY = (f: Frame, py: number) => f.y[0] + (1 - (py - f.top) / f.height) * (f.y[1] - f.y[0]);

export function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
  return out;
}

export function fmt(v: number, digits = 2) {
  if (!Number.isFinite(v)) return "–";
  const s = v.toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export interface AxesOptions {
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  grid?: boolean;
}

export function drawAxes(ctx: CanvasRenderingContext2D, f: Frame, pal: Palette, o: AxesOptions = {}) {
  const xt = o.xTicks ?? ticks(f.x[0], f.x[1]);
  const yt = o.yTicks ?? ticks(f.y[0], f.y[1]);
  ctx.save();
  ctx.lineWidth = 1;
  if (o.grid !== false) {
    ctx.strokeStyle = pal.grid;
    ctx.beginPath();
    for (const v of xt) {
      const x = Math.round(sx(f, v)) + 0.5;
      ctx.moveTo(x, f.top);
      ctx.lineTo(x, f.top + f.height);
    }
    for (const v of yt) {
      const y = Math.round(sy(f, v)) + 0.5;
      ctx.moveTo(f.left, y);
      ctx.lineTo(f.left + f.width, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = pal.axis;
  ctx.beginPath();
  ctx.moveTo(f.left + 0.5, f.top);
  ctx.lineTo(f.left + 0.5, f.top + f.height + 0.5);
  ctx.lineTo(f.left + f.width, f.top + f.height + 0.5);
  ctx.stroke();

  ctx.fillStyle = pal.ink2;
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const v of xt) ctx.fillText(fmt(v), sx(f, v), f.top + f.height + 6);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of yt) ctx.fillText(fmt(v), f.left - 6, sy(f, v));

  ctx.fillStyle = pal.ink2;
  ctx.font = "13px system-ui, -apple-system, sans-serif";
  if (o.xLabel) {
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(o.xLabel, f.left + f.width / 2, f.top + f.height + 38);
  }
  if (o.yLabel) {
    ctx.save();
    ctx.translate(14, f.top + f.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Clips subsequent drawing to the plot area. */
export function clipToFrame(ctx: CanvasRenderingContext2D, f: Frame) {
  ctx.beginPath();
  ctx.rect(f.left, f.top, f.width, f.height);
  ctx.clip();
}

export function polyline(ctx: CanvasRenderingContext2D, f: Frame, xs: ArrayLike<number>, ys: ArrayLike<number>) {
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const x = sx(f, xs[i]);
    const y = sy(f, ys[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/** Shades |theta| > thetaMax as the invalid range, with dashed limits. */
export function drawInvalidBands(ctx: CanvasRenderingContext2D, f: Frame, pal: Palette, tMax: number) {
  ctx.save();
  ctx.fillStyle = pal.invalid;
  const l = sx(f, -tMax);
  const r = sx(f, tMax);
  if (l > f.left) ctx.fillRect(f.left, f.top, l - f.left, f.height);
  if (r < f.left + f.width) ctx.fillRect(r, f.top, f.left + f.width - r, f.height);
  ctx.strokeStyle = pal.muted;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of [l, r]) {
    if (x > f.left && x < f.left + f.width) {
      ctx.moveTo(x, f.top);
      ctx.lineTo(x, f.top + f.height);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Filled point marker: filled = stable, hollow = unstable. */
export function marker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stroke: string, fill: string | null) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill ?? "transparent";
  if (fill) ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
