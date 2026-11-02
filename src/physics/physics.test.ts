import { describe, expect, it } from "vitest";
import {
  armRhs,
  DEFAULT_ARM as P,
  energy,
  equilibria,
  kappa,
  linearization,
  minPressureSum,
  restAngle,
  restScale,
  simulatedPeriod,
  standingEquilibrium,
  stiffness,
  thetaMax,
} from "./arm";
import { DEFAULT_DOUBLE, doubleEnergy, doubleRhs, linearModes, modeFamily, shootMode } from "./doublePendulum";
import {
  boundaryEnergy,
  cDelta,
  dpMax,
  simulateEnergyControl,
  stationaryEnergy,
} from "./energyControl";
import { lyapunov, makeBehaviours, prepares, simulateSwitching } from "./funnels";
import { eulerStep, integrate } from "./integrate";

// Reference values from the exercise (RK4, dt = 1 ms, secant shooting).

describe("1.1 muscle to joint", () => {
  it("kappa, C and valid range", () => {
    expect(kappa(P)).toBeCloseTo(3.333, 3);
    expect(restScale(P)).toBeCloseTo(0.9, 10);
    expect(thetaMax(P)).toBeCloseTo(0.6, 10);
  });
});

describe("1.3 equilibria", () => {
  it("p = (3, 2)", () => {
    const pr = { p1: 3, p2: 2 };
    expect(stiffness(P, pr)).toBeCloseTo(16.67, 2);
    expect(restAngle(P, pr)).toBeCloseTo(0.18, 10);
    expect(standingEquilibrium(P, pr).theta!).toBeCloseTo(0.42, 3);
  });

  it("p = (2.5, 2.5) stands upright", () => {
    expect(standingEquilibrium(P, { p1: 2.5, p2: 2.5 }).theta!).toBeCloseTo(0, 10);
  });

  it("weak co-contraction: upright is unstable, a stable pair appears off-centre", () => {
    const eqs = equilibria(P, { p1: 1.45, p2: 1.45 });
    expect(eqs.find((e) => Math.abs(e.theta) < 1e-9)?.stable).toBe(false);
    expect(eqs.filter((e) => e.stable && Math.abs(e.theta) < 0.6)).toHaveLength(2);
  });
});

describe("1.4 stability", () => {
  it("minimum pressure sum", () => {
    expect(minPressureSum(P)).toBeCloseTo(2.943, 3);
  });

  it("linearization at p = (3, 2)", () => {
    const pr = { p1: 3, p2: 2 };
    const lin = linearization(P, pr, standingEquilibrium(P, pr).theta!);
    expect(lin.Keff).toBeCloseTo(7.71, 2);
    expect(lin.omega).toBeCloseTo(2.777, 3);
    expect(lin.period).toBeCloseTo(2.263, 3);
  });
});

describe("1.5 / 2.4 period vs amplitude", () => {
  it("gets shorter with amplitude at p = (2.5, 2.5)", () => {
    const pr = { p1: 2.5, p2: 2.5 };
    expect(simulatedPeriod(P, pr, 0.05)).toBeCloseTo(2.399, 3);
    expect(simulatedPeriod(P, pr, 0.5)).toBeCloseTo(2.348, 3);
  });
});

describe("2.1 RK4", () => {
  it("energy drift below 1e-6 J over 20 s without damping, Euler much worse", () => {
    const pr = { p1: 2.5, p2: 2.5 };
    const f = armRhs(P, pr, 0);
    const E0 = energy(P, pr, 0.3, 0);
    const drift = (ys: number[][]) => Math.max(...ys.map(([th, w]) => Math.abs(energy(P, pr, th, w) - E0)));
    expect(drift(integrate(f, [0.3, 0], 1e-3, 20000).ys)).toBeLessThan(1e-6);
    expect(drift(integrate(f, [0.3, 0], 1e-3, 20000, undefined, eulerStep).ys)).toBeGreaterThan(1e-3);
  });
});

describe("3 energy shaping", () => {
  it("constants", () => {
    expect(cDelta(P)).toBeCloseTo(3, 10);
    expect(dpMax()).toBeCloseTo(3, 10);
    expect(boundaryEnergy(P)).toBeCloseTo(1.29, 2);
  });

  it("settles at E* = E bar - b / gamma", () => {
    const s = { target: 1, gamma: 0.5, b: 0.3 };
    expect(stationaryEnergy(s)).toBeCloseTo(0.4, 10);
    const run = simulateEnergyControl(P, s, [0.01, 0], 60);
    expect(run.failedAt).toBeNull();
    const tail = run.E.slice(-5000);
    const mean = tail.reduce((a, e) => a + e, 0) / tail.length;
    expect(mean).toBeCloseTo(0.4, 1);
  });
});

describe("4 double arm modes", () => {
  it("linear modes", () => {
    const k0 = linearModes({ ...DEFAULT_DOUBLE, k1: 0, k2: 0 });
    expect(k0.slow.lambda).toBeCloseTo(5.747, 3);
    expect(k0.fast.lambda).toBeCloseTo(33.49, 2);
    expect(k0.slow.ratio).toBeCloseTo(Math.SQRT2, 10);
    expect(k0.fast.ratio).toBeCloseTo(-Math.SQRT2, 10);
    const k10 = linearModes({ ...DEFAULT_DOUBLE, k1: 10, k2: 10 });
    expect(k10.slow.lambda).toBeCloseTo(7.462, 3);
    expect(k10.fast.lambda).toBeCloseTo(91.78, 2);
    expect(k10.slow.period).toBeCloseTo(2.3, 3);
    expect(k10.fast.period).toBeCloseTo(0.656, 3);
    expect(k10.slow.ratio).toBeCloseTo(Math.SQRT2, 10);
  });

  it("nonlinear slow mode by shooting, k = 0", () => {
    const P0 = { ...DEFAULT_DOUBLE, k1: 0, k2: 0 };
    const fam = modeFamily(P0, "slow", { aMax: 0.95 });
    const at = (a: number) => fam.find((m) => Math.abs(m.a - a) < 1e-9)!;
    expect(at(0.55).b).toBeCloseTo(0.7143, 3);
    expect(at(0.55).period).toBeCloseTo(2.681, 3);
    expect(at(0.95).b).toBeCloseTo(1.0348, 3);
    expect(at(0.95).period).toBeCloseTo(2.765, 3);
  });

  it("nonlinear slow mode by shooting, k = 10", () => {
    const P10 = { ...DEFAULT_DOUBLE, k1: 10, k2: 10 };
    for (const [a, b, T] of [
      [0.3, 0.4329, 2.314],
      [0.5, 0.744, 2.34],
      [0.7, 1.0782, 2.385],
    ]) {
      const m = shootMode(P10, a, Math.SQRT2 * a)!;
      expect(m.b).toBeCloseTo(b, 3);
      expect(m.period).toBeCloseTo(T, 2);
    }
  });

  it("near the 3:1 resonance (k = 5) the mode bends strongly; continuation is needed", () => {
    const fam = modeFamily({ ...DEFAULT_DOUBLE, k1: 5, k2: 5 }, "slow", { aMax: 0.5 });
    const m = fam[fam.length - 1];
    expect(m.a).toBeCloseTo(0.5, 10);
    expect(m.b).toBeCloseTo(0.936, 2);
    expect(m.period).toBeCloseTo(2.517, 2);
  });

  it("k = 20", () => {
    const m = shootMode({ ...DEFAULT_DOUBLE, k1: 20, k2: 20 }, 0.5, Math.SQRT2 * 0.5)!;
    expect(m.b).toBeCloseTo(0.7213, 3);
    expect(m.period).toBeCloseTo(2.101, 2);
  });

  it("fast mode family exists", () => {
    const fam = modeFamily({ ...DEFAULT_DOUBLE, k1: 10, k2: 10 }, "fast", { aMax: 0.3 });
    expect(fam.length).toBeGreaterThan(3);
    expect(fam[0].b / fam[0].a).toBeCloseTo(-Math.SQRT2, 1);
  });

  it("conserves energy without damping", () => {
    const Pd = { ...DEFAULT_DOUBLE, k1: 10, k2: 10 };
    const y0 = [0.7, -0.5, 0, 0];
    const { ys } = integrate(doubleRhs(Pd), y0, 1e-3, 10000);
    expect(Math.abs(doubleEnergy(Pd, ys[ys.length - 1]) - doubleEnergy(Pd, y0))).toBeLessThan(1e-6);
  });
});

describe("5 funnels", () => {
  const beh = makeBehaviours(P);

  it("goals and funnel levels", () => {
    expect(beh.A.thetaStar).toBeCloseTo(-0.216, 3);
    expect(beh.B.thetaStar).toBeCloseTo(0.216, 3);
    expect(beh.A.level).toBeCloseTo(0.55, 2);
    expect(beh.B.level).toBeCloseTo(0.55, 2);
    expect(beh.C.level).toBeCloseTo(1.287, 3);
  });

  it("prepares relation: A does not prepare B, but A -> C -> B works", () => {
    expect(lyapunov(P, beh.B, beh.A.thetaStar, 0)).toBeCloseTo(0.649, 3);
    expect(lyapunov(P, beh.C, beh.A.thetaStar, 0)).toBeCloseTo(0.161, 3);
    expect(lyapunov(P, beh.B, beh.C.thetaStar, 0)).toBeCloseTo(0.163, 3);
    expect(prepares(P, beh.A, beh.B)).toBe(false);
    expect(prepares(P, beh.A, beh.C)).toBe(true);
    expect(prepares(P, beh.C, beh.B)).toBe(true);
  });

  it("direct switch A -> B overshoots", () => {
    const run0 = simulateSwitching(P, ["A", "B"], 0, { stopOnFailure: false });
    expect(run0.maxTheta).toBeCloseTo(0.632, 3);
    expect(run0.failedAt).not.toBeNull();
    const run3 = simulateSwitching(P, ["A", "B"], 0.3);
    expect(run3.maxTheta).toBeCloseTo(0.567, 3);
    expect(run3.failedAt).toBeNull();
  });

  it("chain A -> C -> B stays valid even without damping", () => {
    const run = simulateSwitching(P, ["A", "C", "B"], 0);
    expect(run.failedAt).toBeNull();
    expect(run.events.map((e) => e.to)).toEqual(["C", "B"]);
  });
});
