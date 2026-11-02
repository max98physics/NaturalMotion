import { contractions, P_MAX, restAngle, thetaMax, type ArmParams, type Pressures } from "../physics/arm";
import { alpha, type Palette } from "../lib/theme";

export interface ArmDrawOptions {
  theta: number;
  pressures: Pressures;
  showRest?: boolean;
  labels?: boolean;
}

/**
 * Upright arm on a pulley with two muscles below it (muscle 2 left, muscle 1
 * right), as in the sketch. Muscle length and pulley size are exaggerated so
 * the contraction is visible.
 */
export function drawArm(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Palette, P: ArmParams, o: ArmDrawOptions) {
  const armLen = Math.min(h * 0.42, w * 0.8);
  const cx = w / 2;
  const cy = h * 0.52;
  const R = armLen * 0.13; // drawn pulley radius
  const muscleH = h - cy - R - 14;
  const groundY = h - 8;
  const tMax = thetaMax(P);
  const invalid = Math.abs(o.theta) > tMax;

  // valid range wedge
  ctx.save();
  ctx.fillStyle = alpha(pal.s1, 0.07);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, armLen * 1.08, -Math.PI / 2 - tMax, -Math.PI / 2 + tMax);
  ctx.closePath();
  ctx.fill();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = pal.axis;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - armLen * 1.15);
  ctx.stroke();
  ctx.restore();

  // muscles: eps in [0, eMax] shortens the drawn length by up to 45 %
  const [e1, e2] = contractions(P, o.theta);
  const muscle = (x: number, eps: number, p: number) => {
    const clamped = Math.max(0, Math.min(P.eMax, eps));
    const len = muscleH * (1 - (0.45 * clamped) / P.eMax);
    const mw = R * 0.85;
    const top = groundY - len;
    ctx.fillStyle = alpha(pal.s2, 0.15 + 0.6 * (p / P_MAX));
    ctx.strokeStyle = alpha(pal.s2, 0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - mw / 2, top, mw, len, mw / 2);
    ctx.fill();
    ctx.stroke();
    // tendon to the pulley
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, cy);
    ctx.stroke();
  };
  muscle(cx - R, e2, o.pressures.p2);
  muscle(cx + R, e1, o.pressures.p1);

  // ground and post
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - R * 3, groundY);
  ctx.lineTo(cx + R * 3, groundY);
  ctx.stroke();
  ctx.fillStyle = pal.grid;
  ctx.fillRect(cx - R * 0.18, cy, R * 0.36, groundY - cy);

  // pulley
  ctx.fillStyle = pal.surface;
  ctx.strokeStyle = pal.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // rest angle of the muscles
  if (o.showRest) {
    const th0 = restAngle(P, o.pressures);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = pal.s1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + armLen * Math.sin(th0), cy - armLen * Math.cos(th0));
    ctx.stroke();
    ctx.restore();
  }

  // arm and mass
  const tipX = cx + armLen * Math.sin(o.theta);
  const tipY = cy - armLen * Math.cos(o.theta);
  ctx.strokeStyle = invalid ? pal.critical : pal.ink2;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.fillStyle = invalid ? pal.critical : pal.ink;
  ctx.beginPath();
  ctx.arc(tipX, tipY, Math.max(6, armLen * 0.06), 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = pal.ink2;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fill();

  if (o.labels) {
    ctx.fillStyle = pal.ink2;
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText("muscle 2", cx - R * 1.6, groundY - 4);
    ctx.textAlign = "left";
    ctx.fillText("muscle 1", cx + R * 1.6, groundY - 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("θ", cx + armLen * 0.25 * Math.sin(o.theta / 2) + 10, cy - armLen * 0.3);
  }
}

/** Hanging double arm with unit links; theta measured from the downward vertical. */
export function drawDoubleArm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: Palette,
  th1: number,
  th2: number,
  trail?: number[][],
) {
  const L = Math.min(w * 0.27, h * 0.36);
  const cx = w / 2;
  const cy = h * 0.12;
  const x1 = cx + L * Math.sin(th1);
  const y1 = cy + L * Math.cos(th1);
  const x2 = x1 + L * Math.sin(th2);
  const y2 = y1 + L * Math.cos(th2);

  if (trail && trail.length > 1) {
    ctx.strokeStyle = alpha(pal.s1, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    trail.forEach(([a, b], i) => {
      const px = cx + L * (Math.sin(a) + Math.sin(b));
      const py = cy + L * (Math.cos(a) + Math.cos(b));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - L * 0.6, cy);
  ctx.lineTo(cx + L * 0.6, cy);
  ctx.stroke();

  ctx.strokeStyle = pal.ink2;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  for (const [x, y, r] of [
    [cx, cy, 5],
    [x1, y1, 9],
    [x2, y2, 9],
  ]) {
    ctx.fillStyle = r > 5 ? pal.ink : pal.ink2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
}
