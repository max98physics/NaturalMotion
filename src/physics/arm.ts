import { integrate, type Rhs, type Vec } from "./integrate";

/** Single upright arm driven by two antagonistic pneumatic muscles. */
export interface ArmParams {
  e0: number; // contraction at theta = 0
  eMax: number; // maximum contraction
  r: number; // pulley radius = muscle lever arm [m]
  L0: number; // muscle rest length [m]
  k0: number; // force per pressure at e = 0 [N/bar]
  m: number; // point mass [kg]
  l: number; // arm length [m]
  g: number; // gravity [m/s^2]
  b: number; // joint damping [N m s/rad]
}

export const DEFAULT_ARM: ArmParams = {
  e0: 0.1,
  eMax: 0.25,
  r: 0.05,
  L0: 0.3,
  k0: 100,
  m: 1,
  l: 1,
  g: 9.81,
  b: 0.3,
};

export const P_MAX = 4; // bar

export interface Pressures {
  p1: number;
  p2: number;
}

/** Stiffness per bar of pressure sum: K = kappa (p1 + p2). */
export const kappa = (P: ArmParams) => (P.r ** 2 * P.k0) / (P.L0 * P.eMax);

/** Rest angle scale: theta0 = C (p1 - p2) / (p1 + p2). */
export const restScale = (P: ArmParams) => (P.L0 * (P.eMax - P.e0)) / P.r;

/** Both muscles stay within 0 <= eps <= eMax for |theta| <= thetaMax. */
export const thetaMax = (P: ArmParams) => (Math.min(P.e0, P.eMax - P.e0) * P.L0) / P.r;

export const stiffness = (P: ArmParams, pr: Pressures) => kappa(P) * (pr.p1 + pr.p2);

export function restAngle(P: ArmParams, pr: Pressures) {
  const s = pr.p1 + pr.p2;
  return s > 0 ? (restScale(P) * (pr.p1 - pr.p2)) / s : 0;
}

export const gravityStiffness = (P: ArmParams) => P.m * P.g * P.l;

/** Contractions of muscle 1 and 2 at angle theta. */
export function contractions(P: ArmParams, theta: number): [number, number] {
  const d = (P.r * theta) / P.L0;
  return [P.e0 + d, P.e0 - d];
}

/** Muscle torque tau_m = -K (theta - theta0). */
export const muscleTorque = (P: ArmParams, pr: Pressures, theta: number) =>
  -stiffness(P, pr) * (theta - restAngle(P, pr));

export const gravityTorque = (P: ArmParams, theta: number) => gravityStiffness(P) * Math.sin(theta);

/** State y = [theta, theta_dot]; tauExtra is an additional joint torque. */
export function armRhs(P: ArmParams, pr: Pressures, b = P.b, tauExtra = 0): Rhs {
  const K = stiffness(P, pr);
  const th0 = restAngle(P, pr);
  const mgl = gravityStiffness(P);
  const I = P.m * P.l ** 2;
  return ([theta, omega]) => [omega, (mgl * Math.sin(theta) - K * (theta - th0) - b * omega + tauExtra) / I];
}

export function potential(P: ArmParams, pr: Pressures, theta: number) {
  const K = stiffness(P, pr);
  return gravityStiffness(P) * Math.cos(theta) + 0.5 * K * (theta - restAngle(P, pr)) ** 2;
}

export const energy = (P: ArmParams, pr: Pressures, theta: number, omega: number) =>
  0.5 * P.m * P.l ** 2 * omega ** 2 + potential(P, pr, theta);

export interface Equilibrium {
  theta: number;
  stable: boolean;
}

const SCAN_N = 1000; // even count: theta = 0 is not a scan point

/**
 * All equilibria in [-pi, pi]: sign changes of h = K (theta - theta0) - mgl sin(theta)
 * on a grid, refined by bisection. Stable where h' = K - mgl cos(theta) > 0.
 */
export function equilibria(P: ArmParams, pr: Pressures): Equilibrium[] {
  const K = stiffness(P, pr);
  const th0 = restAngle(P, pr);
  const mgl = gravityStiffness(P);
  const h = (th: number) => K * (th - th0) - mgl * Math.sin(th);

  const out: Equilibrium[] = [];
  const dth = (2 * Math.PI) / (SCAN_N - 1);
  let lo = -Math.PI;
  let hLo = h(lo);
  for (let i = 1; i < SCAN_N; i++) {
    const hi = -Math.PI + i * dth;
    const hHi = h(hi);
    if (Math.sign(hLo) !== Math.sign(hHi)) {
      let a = lo;
      let b = hi;
      let ha = hLo;
      for (let k = 0; k < 60; k++) {
        const mid = 0.5 * (a + b);
        const hm = h(mid);
        if (Math.sign(hm) === Math.sign(ha)) {
          a = mid;
          ha = hm;
        } else b = mid;
      }
      const theta = 0.5 * (a + b);
      out.push({ theta, stable: K - mgl * Math.cos(theta) > 0 });
    }
    lo = hi;
    hLo = hHi;
  }
  return out;
}

export type EquilibriumRegion = "stable" | "onlyUnstable" | "none";

/**
 * The stable equilibrium inside the valid range closest to theta0, and which
 * of three regions the pressure pair falls into.
 */
export function standingEquilibrium(P: ArmParams, pr: Pressures): { theta: number | null; region: EquilibriumRegion } {
  const tMax = thetaMax(P);
  const valid = equilibria(P, pr).filter((e) => Math.abs(e.theta) <= tMax);
  const stable = valid.filter((e) => e.stable);
  if (stable.length === 0) return { theta: null, region: valid.length ? "onlyUnstable" : "none" };
  const th0 = restAngle(P, pr);
  const best = stable.reduce((a, e) => (Math.abs(e.theta - th0) < Math.abs(a.theta - th0) ? e : a));
  return { theta: best.theta, region: "stable" };
}

/** Linearization at an equilibrium: effective stiffness, natural frequency and period. */
export function linearization(P: ArmParams, pr: Pressures, thetaStar: number) {
  const Keff = stiffness(P, pr) - gravityStiffness(P) * Math.cos(thetaStar);
  const I = P.m * P.l ** 2;
  const omega = Keff > 0 ? Math.sqrt(Keff / I) : NaN;
  return { Keff, omega, period: (2 * Math.PI) / omega };
}

/** Smallest pressure sum for which the upright position theta = 0 is stable (K = mgl). */
export const minPressureSum = (P: ArmParams) => gravityStiffness(P) / kappa(P);

/** Period of the undamped oscillation started at rest at theta = A, measured from the simulation. */
export function simulatedPeriod(P: ArmParams, pr: Pressures, A: number, T = 30, dt = 1e-3) {
  const f = armRhs(P, pr, 0);
  const { t, ys } = integrate(f, [A, 0], dt, Math.round(T / dt));
  const crossings: number[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const w0 = ys[i][1];
    const w1 = ys[i + 1][1];
    if (w0 > 0 && w1 <= 0) crossings.push(t[i] + ((t[i + 1] - t[i]) * w0) / (w0 - w1));
  }
  if (crossings.length < 2) return NaN;
  return (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
}

export type { Vec };
