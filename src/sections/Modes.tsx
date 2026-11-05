import { useEffect, useMemo, useRef, useState } from "react";
import { drawDoubleArm } from "../components/drawArm";
import { LegendKey, Placeholder, Readout, Segmented, Slider, TeX } from "../components/ui";
import { useAnimationLoop, useCanvas, useVisible } from "../lib/canvas";
import { clipToFrame, drawAxes, fmt, makeFrame, marker, sx, sy, type Frame } from "../lib/plot";
import { alpha, usePalette, type Palette } from "../lib/theme";
import {
  DEFAULT_DOUBLE,
  doubleRhs,
  linearModes,
  modeFamily,
  type DoubleParams,
  type JointTorques,
  type ModeId,
  type ModePoint,
} from "../physics/doublePendulum";
import { rk4Step, type Vec } from "../physics/integrate";

const TH1: [number, number] = [-1.1, 1.1];
const TH2: [number, number] = [-1.6, 1.6];
const DT = 1e-3;
const TRAIL_S = 8;

const families = new Map<number, Record<ModeId, ModePoint[]>>();

/** Mode families for k1 = k2 = k, cached per k. */
export function familiesFor(k: number) {
  let fam = families.get(k);
  if (!fam) {
    const P = { ...DEFAULT_DOUBLE, k1: k, k2: k };
    fam = { slow: modeFamily(P, "slow", { aMax: 1 }), fast: modeFamily(P, "fast", { aMax: 0.6 }) };
    families.set(k, fam);
  }
  return fam;
}

/** Configuration plane (theta1, theta2): mode families, linear modes and the live trace. */
export function drawConfigPlane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: Palette,
  P: DoubleParams,
  fam: Record<ModeId, ModePoint[]>,
  selected: { mode: ModeId; index: number } | null,
  trace: Vec[],
  current: Vec,
): Frame {
  const f = makeFrame(w, h, TH1, TH2);
  drawAxes(ctx, f, pal, { xLabel: "θ₁ shoulder [rad]", yLabel: "θ₂ elbow link [rad]" });
  ctx.save();
  clipToFrame(ctx, f);
  const lin = linearModes(P);
  const color: Record<ModeId, string> = { slow: pal.s1, fast: pal.s2 };
  for (const mode of ["slow", "fast"] as ModeId[]) {
    // linear mode: straight line through the origin
    ctx.strokeStyle = color[mode];
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(f, -2), sy(f, -2 * lin[mode].ratio));
    ctx.lineTo(sx(f, 2), sy(f, 2 * lin[mode].ratio));
    ctx.stroke();
    ctx.setLineDash([]);
    fam[mode].forEach((m, idx) => {
      const isSel = selected?.mode === mode && selected.index === idx;
      ctx.strokeStyle = isSel ? color[mode] : alpha(color[mode], 0.35);
      ctx.lineWidth = isSel ? 3 : 1.2;
      ctx.beginPath();
      m.path.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(sx(f, a), sy(f, b)) : ctx.lineTo(sx(f, a), sy(f, b))));
      ctx.stroke();
    });
  }
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  trace.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(sx(f, a), sy(f, b)) : ctx.lineTo(sx(f, a), sy(f, b))));
  ctx.stroke();
  marker(ctx, sx(f, current[0]), sy(f, current[1]), 5, pal.surface, pal.ink);
  ctx.restore();
  return f;
}

/** Double arm simulated in real time; returns state refs and a restart function. */
export function useDoubleArmSim(P: DoubleParams, running: boolean, onFrame: () => void, torques?: JointTorques) {
  const sim = useRef({ y: [0.5, 0.7, 0, 0] as Vec, t: 0, trace: [] as Vec[] });
  const restart = (y0: Vec) => {
    sim.current = { y: y0, t: 0, trace: [[y0[0], y0[1]]] };
  };
  useAnimationLoop(running, (dtReal) => {
    const s = sim.current;
    const f = doubleRhs(P, torques);
    const n = Math.round(dtReal / DT);
    for (let k = 0; k < n; k++) {
      s.y = rk4Step(f, s.y, s.t, DT);
      s.t += DT;
      if (k % 8 === 0) s.trace.push([s.y[0], s.y[1]]);
    }
    const keep = Math.round(TRAIL_S / (8 * DT));
    if (s.trace.length > keep) s.trace.splice(0, s.trace.length - keep);
    onFrame();
  });
  return { sim, restart };
}

export function Modes() {
  const pal = usePalette();
  const plane = useCanvas(1.25);
  const arm = useCanvas(0.95);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const [k, setK] = useState(10);
  const [mode, setMode] = useState<ModeId>("slow");
  const [amp, setAmp] = useState(0.7);
  const [start, setStart] = useState<"nonlinear" | "linear">("nonlinear");
  const P = useMemo(() => ({ ...DEFAULT_DOUBLE, k1: k, k2: k, b: 0 }), [k]);
  const fam = useMemo(() => familiesFor(k), [k]);
  const lin = linearModes(P);
  const list = fam[mode];
  const found = list.findIndex((m) => m.a >= amp - 1e-9);
  const index = found === -1 ? list.length - 1 : found;
  const point = index >= 0 ? list[index] : null;

  const draw = () => {
    const s = sim.current;
    const pctx = plane.context();
    if (pctx) drawConfigPlane(pctx, plane.size.w, plane.size.h, pal, P, fam, point ? { mode, index } : null, s.trace, s.y);
    const actx = arm.context();
    if (actx) drawDoubleArm(actx, arm.size.w, arm.size.h, pal, s.y[0], s.y[1], s.trace.slice(-300));
  };
  const { sim, restart } = useDoubleArmSim(P, visible, draw);
  useEffect(draw);

  useEffect(() => {
    if (!point) return;
    const b = start === "nonlinear" ? point.b : lin[mode].ratio * point.a;
    restart([point.a, b, 0, 0]);
    draw();
  }, [point, start, mode, k]);

  const maxAmp = list.length ? list[list.length - 1].a : 0.05;

  return (
    <section id="modes">
      <h2>
        <span className="num">6</span>Nonlinear normal modes
      </h2>
      <div className="prose">
        <Placeholder
          points={[
            "Hanging double arm with muscle springs at shoulder (k₁) and elbow (k₂); unit masses and lengths",
            "Linear normal modes: in phase (slow) and in anti-phase (fast); straight lines in the configuration plane",
            "Nonlinear normal modes: the lines bend into curves; each mode is a two-dimensional invariant surface (eigenmanifold) in the four-dimensional state space",
            "Found by shooting: start at rest, integrate until θ̇₁ = 0, demand θ̇₂ = 0 there, secant in θ₂; continue in amplitude",
            "Near the 3:1 internal resonance (k ≈ 5) the slow mode bends strongly; starting on the linear guess instead of the mode leaves the surface",
          ]}
        />
        <TeX block>{String.raw`M(\theta)\,\ddot\theta + c(\theta,\dot\theta) + g(\theta) + K\theta = 0,\qquad M = \begin{pmatrix} 2 & \cos(\theta_1-\theta_2) \\ \cos(\theta_1-\theta_2) & 1 \end{pmatrix}`}</TeX>
      </div>
      <div className="figure" ref={wrap}>
        <div className="controls">
          <Segmented
            label="spring k₁ = k₂"
            value={k}
            onChange={setK}
            options={[0, 5, 10, 20].map((v) => ({ value: v, label: String(v) }))}
          />
          <Segmented
            label="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "slow", label: "in phase" },
              { value: "fast", label: "anti-phase" },
            ]}
          />
          <Slider label="amplitude θ₁" value={Math.min(amp, maxAmp)} min={0.05} max={maxAmp} step={0.05} format={(v) => `${v.toFixed(2)} rad`} onChange={setAmp} />
          <Segmented
            label="start"
            value={start}
            onChange={setStart}
            options={[
              { value: "nonlinear", label: "on the mode" },
              { value: "linear", label: "linear guess" },
            ]}
          />
        </div>
        <div className="figure-grid even">
          <div>
            <canvas ref={plane.ref} className="plot" role="img" aria-label="Configuration plane with the mode families" />
            <div className="legend">
              <LegendKey kind="line" color={pal.s1} label="in-phase family" />
              <LegendKey kind="line" color={pal.s2} label="anti-phase family" />
              <LegendKey kind="dash" color={pal.muted} label="linear modes" />
              <LegendKey kind="line" color={pal.ink} label={`last ${TRAIL_S} s`} />
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Animated double arm" />
          </div>
        </div>
        <div className="readouts">
          <Readout name="turning point (θ₁, θ₂)" value={point ? `(${fmt(point.a)}, ${fmt(point.b, 3)})` : "–"} />
          <Readout name="ratio θ₂/θ₁ (linear)" value={point ? `${fmt(point.b / point.a, 3)} (${fmt(lin[mode].ratio, 3)})` : "–"} />
          <Readout name="period (linear)" value={point ? `${fmt(point.period, 3)} s (${fmt(lin[mode].period, 3)} s)` : "–"} />
          <Readout name="Ω_fast / Ω_slow (linear)" value={fmt(lin.fast.omega / lin.slow.omega, 3)} />
        </div>
        <p className="caption">
          Each curve is one periodic orbit, drawn between its two turning points. “Linear guess” starts on the straight line of the linear
          mode instead.
        </p>
      </div>
    </section>
  );
}
