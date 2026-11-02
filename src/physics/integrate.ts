export type Vec = number[];
export type Rhs = (y: Vec, t: number) => Vec;

const axpy = (y: Vec, a: number, k: Vec): Vec => y.map((yi, i) => yi + a * k[i]);

/** One classical Runge-Kutta 4 step. */
export function rk4Step(f: Rhs, y: Vec, t: number, dt: number): Vec {
  const k1 = f(y, t);
  const k2 = f(axpy(y, dt / 2, k1), t + dt / 2);
  const k3 = f(axpy(y, dt / 2, k2), t + dt / 2);
  const k4 = f(axpy(y, dt, k3), t + dt);
  return y.map((yi, i) => yi + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function eulerStep(f: Rhs, y: Vec, t: number, dt: number): Vec {
  return axpy(y, dt, f(y, t));
}

export interface Trajectory {
  t: number[];
  ys: Vec[];
}

/**
 * Integrates from y0 for nSteps steps of size dt. `stop` ends the run early
 * (the state that triggered it is included).
 */
export function integrate(
  f: Rhs,
  y0: Vec,
  dt: number,
  nSteps: number,
  stop?: (y: Vec, t: number) => boolean,
  step = rk4Step,
): Trajectory {
  const t = [0];
  const ys = [y0];
  let y = y0;
  for (let i = 1; i <= nSteps; i++) {
    y = step(f, y, (i - 1) * dt, dt);
    t.push(i * dt);
    ys.push(y);
    if (stop?.(y, i * dt)) break;
  }
  return { t, ys };
}
