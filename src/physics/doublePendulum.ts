import { rk4Step, type Rhs, type Vec } from "./integrate";

/**
 * Hanging double arm, unit masses at the end of each unit-length link.
 * Absolute angles theta1, theta2 measured from the downward vertical.
 * Muscle springs: shoulder k1 on theta1, elbow k2 on theta2 - theta1.
 * State y = [theta1, theta2, omega1, omega2].
 */
export interface DoubleParams {
  g: number;
  k1: number;
  k2: number;
  b: number; // joint damping (shoulder and elbow)
}

export const DEFAULT_DOUBLE: DoubleParams = { g: 9.81, k1: 10, k2: 10, b: 0 };

/** Joint torques [shoulder, elbow] as a function of time and state. */
export type JointTorques = (t: number, y: Vec) => [number, number];

export function doubleRhs(P: DoubleParams, torques?: JointTorques): Rhs {
  return (y, t) => {
    const [th1, th2, w1, w2] = y;
    const c = Math.cos(th1 - th2);
    const s = Math.sin(th1 - th2);
    const [tauS, tauE] = torques ? torques(t, y) : [0, 0];
    // generalized forces of the joint torques and joint damping
    const Q1 = tauS - tauE - P.b * w1 + P.b * (w2 - w1);
    const Q2 = tauE - P.b * (w2 - w1);
    const r1 = Q1 - (s * w2 * w2 + 2 * P.g * Math.sin(th1) + P.k1 * th1 - P.k2 * (th2 - th1));
    const r2 = Q2 - (-s * w1 * w1 + P.g * Math.sin(th2) + P.k2 * (th2 - th1));
    const det = 2 - c * c;
    return [w1, w2, (r1 - c * r2) / det, (2 * r2 - c * r1) / det];
  };
}

export function doubleEnergy(P: DoubleParams, [th1, th2, w1, w2]: Vec) {
  const kinetic = 0.5 * (2 * w1 * w1 + 2 * Math.cos(th1 - th2) * w1 * w2 + w2 * w2);
  const potential =
    -2 * P.g * Math.cos(th1) - P.g * Math.cos(th2) + 0.5 * P.k1 * th1 ** 2 + 0.5 * P.k2 * (th2 - th1) ** 2;
  return kinetic + potential;
}

export type ModeId = "slow" | "fast";

export interface LinearMode {
  lambda: number;
  omega: number;
  period: number;
  ratio: number; // theta2 / theta1
}

/** Linear modes: det(K - lambda M0) = 0 with M0 = [[2, 1], [1, 1]]. */
export function linearModes(P: DoubleParams): Record<ModeId, LinearMode> {
  const K11 = 2 * P.g + P.k1 + P.k2;
  const K22 = P.g + P.k2;
  const K12 = -P.k2;
  // lambda^2 - (K11 + 2 K22 - 2 K12) lambda + (K11 K22 - K12^2) = 0, det(M0) = 1
  const p = K11 + 2 * K22 - 2 * K12;
  const q = K11 * K22 - K12 * K12;
  const disc = Math.sqrt(p * p - 4 * q);
  const make = (lambda: number): LinearMode => ({
    lambda,
    omega: Math.sqrt(lambda),
    period: (2 * Math.PI) / Math.sqrt(lambda),
    ratio: (K11 - 2 * lambda) / (lambda - K12),
  });
  return { slow: make((p - disc) / 2), fast: make((p + disc) / 2) };
}

interface Shot {
  residual: number; // omega2 when omega1 returns to zero
  tHalf: number;
  path: Vec[]; // [theta1, theta2] along the half period
}

/**
 * Starts at rest in (a, b) and integrates until omega1 returns to zero.
 * The crossing is located inside the last step by a secant on the sub-step.
 */
function shoot(P: DoubleParams, a: number, b: number, dt: number, tMax: number, keepEvery = 0): Shot | null {
  const f = doubleRhs({ ...P, b: 0 });
  let y: Vec = [a, b, 0, 0];
  const dir = Math.sign(f(y, 0)[2]);
  if (dir === 0) return null;
  const path: Vec[] = keepEvery ? [[a, b]] : [];
  const n = Math.round(tMax / dt);
  for (let k = 0; k < n; k++) {
    const next = rk4Step(f, y, k * dt, dt);
    if (k > 0 && next[2] * dir <= 0) {
      let t0 = 0;
      let w0 = y[2];
      let t1 = dt;
      let w1 = next[2];
      let end = next;
      for (let it = 0; it < 6 && w1 !== w0; it++) {
        const tc = t1 - (w1 * (t1 - t0)) / (w1 - w0);
        end = rk4Step(f, y, k * dt, tc);
        t0 = t1;
        w0 = w1;
        t1 = tc;
        w1 = end[2];
      }
      if (keepEvery) path.push([end[0], end[1]]);
      return { residual: end[3], tHalf: k * dt + t1, path };
    }
    y = next;
    if (keepEvery && k % keepEvery === 0) path.push([y[0], y[1]]);
  }
  return null;
}

export interface ModePoint {
  a: number; // theta1 at the turning point
  b: number; // theta2 at the turning point
  period: number;
  path: Vec[]; // half-period path in (theta1, theta2)
}

/** Nonlinear normal mode through (a, b) by shooting with a secant method in b. */
export function shootMode(P: DoubleParams, a: number, bGuess: number, { dt = 1e-3, tMax = 10 } = {}): ModePoint | null {
  const res = (b: number) => shoot(P, a, b, dt, tMax)?.residual ?? NaN;
  let b0 = bGuess;
  let b1 = bGuess * (1 + 1e-3) + 1e-6;
  let r0 = res(b0);
  let r1 = res(b1);
  for (let it = 0; it < 40; it++) {
    if (!Number.isFinite(r0) || !Number.isFinite(r1) || r1 === r0) return null;
    const b2 = b1 - (r1 * (b1 - b0)) / (r1 - r0);
    b0 = b1;
    r0 = r1;
    b1 = b2;
    r1 = res(b1);
    if (Math.abs(b1 - b0) < 1e-11) {
      const shot = shoot(P, a, b1, dt, tMax, 10);
      if (!shot || Math.abs(shot.residual) > 1e-6) return null;
      return { a, b: b1, period: 2 * shot.tHalf, path: shot.path };
    }
  }
  return null;
}

/**
 * Family of a mode, continued in the amplitude a. Each guess comes from the
 * ratio b/a of the previous amplitude; a jump in that ratio would mean the
 * secant has slid onto the other mode.
 */
export function modeFamily(P: DoubleParams, mode: ModeId, { aStep = 0.05, aMax = 1, dt = 1e-3 } = {}): ModePoint[] {
  const family: ModePoint[] = [];
  let ratio = linearModes(P)[mode].ratio;
  for (let i = 1; i * aStep <= aMax + 1e-9; i++) {
    const a = i * aStep;
    const point = shootMode(P, a, ratio * a, { dt });
    if (!point || Math.abs(point.b) > Math.PI || Math.sign(point.b) !== Math.sign(ratio)) break;
    if (Math.abs(point.b / a - ratio) > 0.5 * Math.abs(ratio)) break;
    family.push(point);
    ratio = point.b / a;
  }
  return family;
}
