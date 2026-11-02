import { armRhs, energy, standingEquilibrium, thetaMax, type ArmParams, type Pressures } from "./arm";
import { pressuresFromDifference } from "./energyControl";
import { rk4Step, type Vec } from "./integrate";

/**
 * Three postures at pressure sum 5 bar (Burridge, Rizzi, Koditschek 1999):
 * each behaviour holds a pressure difference; its funnel is a sublevel set of
 * the energy relative to its equilibrium.
 */
export type BehaviourId = "A" | "C" | "B";

export interface Behaviour {
  id: BehaviourId;
  dp: number;
  pressures: Pressures;
  thetaStar: number;
  /** Funnel level: largest c with {V < c} inside the valid range. */
  level: number;
}

export const BEHAVIOUR_DP: Record<BehaviourId, number> = { A: -0.5, C: 0, B: 0.5 };

/** Lyapunov function V_i = E(theta, theta_dot; p_i) - E(theta_i*, 0; p_i). */
export function lyapunov(P: ArmParams, beh: Behaviour, theta: number, omega: number) {
  return energy(P, beh.pressures, theta, omega) - energy(P, beh.pressures, beh.thetaStar, 0);
}

export function makeBehaviour(P: ArmParams, id: BehaviourId): Behaviour {
  const pressures = pressuresFromDifference(BEHAVIOUR_DP[id]);
  const eq = standingEquilibrium(P, pressures);
  if (eq.theta === null) throw new Error(`behaviour ${id} has no stable equilibrium`);
  const partial = { id, dp: BEHAVIOUR_DP[id], pressures, thetaStar: eq.theta, level: 0 };
  const tMax = thetaMax(P);
  partial.level = Math.min(lyapunov(P, partial, tMax, 0), lyapunov(P, partial, -tMax, 0));
  return partial;
}

export const makeBehaviours = (P: ArmParams): Record<BehaviourId, Behaviour> => ({
  A: makeBehaviour(P, "A"),
  C: makeBehaviour(P, "C"),
  B: makeBehaviour(P, "B"),
});

/** Is the state inside the estimated funnel of beh? */
export const inFunnel = (P: ArmParams, beh: Behaviour, theta: number, omega: number) =>
  Math.abs(theta) <= thetaMax(P) && lyapunov(P, beh, theta, omega) < beh.level;

/** Phi_i prepares Phi_j if the goal of i lies inside the funnel of j. */
export const prepares = (P: ArmParams, from: Behaviour, to: Behaviour) =>
  lyapunov(P, to, from.thetaStar, 0) < to.level;

export interface SwitchEvent {
  t: number;
  to: BehaviourId;
}

export interface SwitchRun {
  t: number[];
  theta: number[];
  omega: number[];
  active: BehaviourId[];
  events: SwitchEvent[];
  failedAt: number | null;
  maxTheta: number;
}

/**
 * Starts at rest in the goal of the first behaviour and switches along `plan`.
 * The first switch happens at tSwitch; every later one as soon as the state
 * is inside the next funnel.
 */
export function simulateSwitching(
  P: ArmParams,
  plan: BehaviourId[],
  b: number,
  { tSwitch = 1, T = 15, dt = 1e-3, stopOnFailure = true } = {},
): SwitchRun {
  const beh = makeBehaviours(P);
  const tMax = thetaMax(P);
  let stage = 0;
  let y: Vec = [beh[plan[0]].thetaStar, 0];
  const run: SwitchRun = { t: [], theta: [], omega: [], active: [], events: [], failedAt: null, maxTheta: -Infinity };
  const n = Math.round(T / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const next = plan[stage + 1];
    if (next && (stage === 0 ? t >= tSwitch : inFunnel(P, beh[next], y[0], y[1]))) {
      stage++;
      run.events.push({ t, to: next });
    }
    const cur = beh[plan[stage]];
    run.t.push(t);
    run.theta.push(y[0]);
    run.omega.push(y[1]);
    run.active.push(cur.id);
    if (stage > 0) run.maxTheta = Math.max(run.maxTheta, y[0]);
    if (Math.abs(y[0]) > tMax && run.failedAt === null) {
      run.failedAt = t;
      if (stopOnFailure) break;
    }
    y = rk4Step(armRhs(P, cur.pressures, b), y, t, dt);
  }
  return run;
}

/**
 * True basin of a behaviour on a grid, by simulation: a start counts as captured
 * once it enters the estimated funnel (then it cannot leave), and as lost when
 * it leaves the valid range.
 */
export function basinGrid(
  P: ArmParams,
  beh: Behaviour,
  b: number,
  thetaRange: [number, number],
  omegaRange: [number, number],
  nx: number,
  ny: number,
  { T = 20, dt = 2e-3 } = {},
): Uint8Array {
  const tMax = thetaMax(P);
  const f = armRhs(P, beh.pressures, b);
  const out = new Uint8Array(nx * ny);
  const n = Math.round(T / dt);
  for (let j = 0; j < ny; j++) {
    const omega0 = omegaRange[0] + ((omegaRange[1] - omegaRange[0]) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const theta0 = thetaRange[0] + ((thetaRange[1] - thetaRange[0]) * i) / (nx - 1);
      let y: Vec = [theta0, omega0];
      let captured = 0;
      for (let k = 0; k < n; k++) {
        if (Math.abs(y[0]) > tMax) break;
        if (inFunnel(P, beh, y[0], y[1])) {
          captured = 1;
          break;
        }
        y = rk4Step(f, y, k * dt, dt);
      }
      out[j * nx + i] = captured;
    }
  }
  return out;
}
