import { armRhs, gravityStiffness, P_MAX, stiffness, thetaMax, type ArmParams, type Pressures } from "./arm";
import { rk4Step, type Vec } from "./integrate";

/**
 * Energy shaping through the pressure difference at a fixed pressure sum:
 * p1 = S/2 + dp/2, p2 = S/2 - dp/2, so that tau_m = -K theta + cDelta dp.
 */
export const PRESSURE_SUM = 5; // bar

export const pressuresFromDifference = (dp: number, sum = PRESSURE_SUM): Pressures => ({
  p1: sum / 2 + dp / 2,
  p2: sum / 2 - dp / 2,
});

/** Torque per bar of pressure difference. */
export const cDelta = (P: ArmParams) => (P.r * P.k0 * (P.eMax - P.e0)) / P.eMax;

/** Largest |dp| that keeps both pressures in [0, P_MAX]. */
export const dpMax = (sum = PRESSURE_SUM) => 2 * Math.min(P_MAX - sum / 2, sum / 2);

/** Energy relative to the upright rest state at dp = 0. */
export function relativeEnergy(P: ArmParams, theta: number, omega: number, sum = PRESSURE_SUM) {
  const K = stiffness(P, pressuresFromDifference(0, sum));
  return 0.5 * P.m * P.l ** 2 * omega ** 2 + gravityStiffness(P) * (Math.cos(theta) - 1) + 0.5 * K * theta ** 2;
}

export interface EnergyControlSettings {
  target: number; // E bar [J]
  gamma: number; // controller gain
  b: number; // damping
}

/** dp = clip(gamma (E bar - E) theta_dot / cDelta, +-dpMax). */
export function controlLaw(P: ArmParams, s: EnergyControlSettings, theta: number, omega: number) {
  const E = relativeEnergy(P, theta, omega);
  const lim = dpMax();
  const dp = (s.gamma * (s.target - E) * omega) / cDelta(P);
  return Math.max(-lim, Math.min(lim, dp));
}

/** Predicted stationary energy E* = E bar - b / gamma (unsaturated controller). */
export const stationaryEnergy = (s: EnergyControlSettings) => s.target - s.b / s.gamma;

/** Energy of the state at rest on the edge of the valid range. */
export function boundaryEnergy(P: ArmParams) {
  return relativeEnergy(P, thetaMax(P), 0);
}

export interface EnergyRun {
  t: number[];
  theta: number[];
  omega: number[];
  E: number[];
  dp: number[];
  failedAt: number | null; // time of leaving the valid range
}

/** Pressure is held constant over each step (zero-order hold, like a valve command). */
export function simulateEnergyControl(
  P: ArmParams,
  s: EnergyControlSettings,
  y0: Vec = [0.01, 0],
  T = 30,
  dt = 1e-3,
): EnergyRun {
  const run: EnergyRun = { t: [], theta: [], omega: [], E: [], dp: [], failedAt: null };
  const tMax = thetaMax(P);
  let y = y0;
  const n = Math.round(T / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const dp = controlLaw(P, s, y[0], y[1]);
    run.t.push(t);
    run.theta.push(y[0]);
    run.omega.push(y[1]);
    run.E.push(relativeEnergy(P, y[0], y[1]));
    run.dp.push(dp);
    if (Math.abs(y[0]) > tMax) {
      run.failedAt = t;
      break;
    }
    y = rk4Step(armRhs(P, pressuresFromDifference(dp), s.b), y, t, dt);
  }
  return run;
}
