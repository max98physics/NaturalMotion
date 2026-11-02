import { useEffect, useMemo, useRef, useState } from "react";
import { drawArm } from "../components/drawArm";
import { PressureSliders } from "../components/PressureSliders";
import { LegendKey, Placeholder, Readout, Slider, TeX } from "../components/ui";
import { useAnimationLoop, useCanvas, useVisible } from "../lib/canvas";
import { isoline, sampleGrid, strokeSegments } from "../lib/contour";
import { clipToFrame, drawAxes, drawInvalidBands, fmt, invX, invY, makeFrame, marker, sx, sy, type Frame } from "../lib/plot";
import { usePalette } from "../lib/theme";
import {
  armRhs,
  DEFAULT_ARM as P,
  energy,
  equilibria,
  linearization,
  standingEquilibrium,
  thetaMax,
  type Pressures,
} from "../physics/arm";
import { rk4Step, type Vec } from "../physics/integrate";

const TH: [number, number] = [-1, 1];
const OM: [number, number] = [-3, 3];
const DT = 1e-3;
const T_RUN = 25; // s simulated per launch

export function Standing({ pressures, setPressures }: { pressures: Pressures; setPressures: (p: Pressures) => void }) {
  const pal = usePalette();
  const phase = useCanvas(1.5);
  const arm = useCanvas(0.8);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const [b, setB] = useState(P.b);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "fail" }>({ text: "", kind: "" });
  const sim = useRef({ y: [0.25, 0] as Vec, t: 0, start: [0.25, 0] as Vec, trail: [] as Vec[], failed: false });
  const frameRef = useRef<Frame | null>(null);

  const eqs = useMemo(() => equilibria(P, pressures), [pressures]);
  const standing = useMemo(() => standingEquilibrium(P, pressures), [pressures]);
  const lin = standing.theta === null ? null : linearization(P, pressures, standing.theta);
  const contours = useMemo(() => {
    const g = sampleGrid(161, 121, TH, OM, (th, om) => energy(P, pressures, th, om));
    const lo = Math.min(...g.values);
    const hi = energy(P, pressures, 0, OM[1] * 0.9);
    const levels = Array.from({ length: 16 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 16);
    return levels.map((l) => isoline(g, l));
  }, [pressures]);

  const launch = (y0: Vec) => {
    sim.current = { y: y0, t: 0, start: y0, trail: [y0], failed: false };
    setStatus({ text: "", kind: "" });
    setRunning(true);
  };

  // relaunch from the same start when pressures or damping change
  useEffect(() => launch(sim.current.start), [pressures, b]);

  const draw = () => {
    const pctx = phase.context();
    if (pctx) {
      const f = makeFrame(phase.size.w, phase.size.h, TH, OM);
      frameRef.current = f;
      drawAxes(pctx, f, pal, { xLabel: "θ [rad]", yLabel: "θ̇ [rad/s]", grid: false });
      pctx.save();
      clipToFrame(pctx, f);
      drawInvalidBands(pctx, f, pal, thetaMax(P));
      pctx.strokeStyle = pal.axis;
      pctx.lineWidth = 1;
      for (const segs of contours) strokeSegments(pctx, segs, (x, y) => [sx(f, x), sy(f, y)]);
      const s = sim.current;
      pctx.strokeStyle = pal.s1;
      pctx.lineWidth = 2;
      pctx.beginPath();
      s.trail.forEach(([th, om], i) => (i === 0 ? pctx.moveTo(sx(f, th), sy(f, om)) : pctx.lineTo(sx(f, th), sy(f, om))));
      pctx.stroke();
      marker(pctx, sx(f, s.start[0]), sy(f, s.start[1]), 4, pal.s1, pal.surface);
      for (const e of eqs) marker(pctx, sx(f, e.theta), sy(f, 0), 6, pal.ink, e.stable ? pal.ink : pal.surface);
      if (s.failed) {
        const x = sx(f, s.y[0]);
        const y = sy(f, s.y[1]);
        pctx.strokeStyle = pal.critical;
        pctx.lineWidth = 2.5;
        pctx.beginPath();
        pctx.moveTo(x - 6, y - 6);
        pctx.lineTo(x + 6, y + 6);
        pctx.moveTo(x + 6, y - 6);
        pctx.lineTo(x - 6, y + 6);
        pctx.stroke();
      } else {
        marker(pctx, sx(f, s.y[0]), sy(f, s.y[1]), 5, pal.surface, pal.s1);
      }
      pctx.restore();
    }
    const actx = arm.context();
    if (actx) drawArm(actx, arm.size.w, arm.size.h, pal, P, { theta: sim.current.y[0], pressures, showRest: true });
  };

  useAnimationLoop(running && visible, (dtReal) => {
    const s = sim.current;
    const f = armRhs(P, pressures, b);
    const n = Math.round(dtReal / DT);
    for (let k = 0; k < n && !s.failed; k++) {
      s.y = rk4Step(f, s.y, s.t, DT);
      s.t += DT;
      if (k % 10 === 0) s.trail.push(s.y);
      if (Math.abs(s.y[0]) > thetaMax(P)) s.failed = true;
    }
    if (s.trail.length > 4000) s.trail.splice(0, s.trail.length - 4000);
    if (s.failed) {
      setRunning(false);
      setStatus({ text: `Left the valid range after ${s.t.toFixed(2)} s: one muscle is fully contracted or slack.`, kind: "fail" });
    } else if (s.t > T_RUN) {
      setRunning(false);
      setStatus({ text: "Stayed in the valid range.", kind: "ok" });
    }
    draw();
  });
  useEffect(draw);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = frameRef.current;
    if (!f) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const th = invX(f, e.clientX - rect.left);
    const om = invY(f, e.clientY - rect.top);
    if (th < TH[0] || th > TH[1] || om < OM[0] || om > OM[1]) return;
    launch([th, om]);
  };

  return (
    <section id="standing">
      <p className="kicker">2 · Standing</p>
      <h2>Can the arm stand up?</h2>
      <div className="prose">
        <Placeholder
          points={[
            "Equilibria from K (θ* − θ₀) = m g l sin θ*; why θ* lies further out than θ₀ (gravity pulls in the direction of the tilt)",
            "Linearization: the effective stiffness K − m g l cos θ* decides stability",
            "Co-contraction: a minimum pressure sum is needed before the upright arm can stand at all",
            "How to read the phase portrait: energy contours of the undamped arm, trajectories of the damped arm",
          ]}
        />
        <TeX block>{String.raw`K_\text{eff} = K - m g l \cos\theta^* > 0,\qquad \Omega = \sqrt{K_\text{eff} / (m l^2)}`}</TeX>
      </div>
      <div className="figure" ref={wrap}>
        <div className="controls">
          <PressureSliders pressures={pressures} setPressures={setPressures} />
          <Slider label="damping b" value={b} min={0} max={1} step={0.05} format={(v) => `${v.toFixed(2)} N m s`} onChange={setB} />
        </div>
        <div className="figure-grid">
          <div>
            <canvas
              ref={phase.ref}
              className="plot"
              style={{ cursor: "crosshair" }}
              onPointerDown={onPointer}
              role="img"
              aria-label="Phase portrait; click to start a trajectory"
            />
            <div className="legend">
              <LegendKey kind="line" color={pal.axis} label="energy contours (b = 0)" />
              <LegendKey kind="line" color={pal.s1} label="trajectory" />
              <LegendKey color={pal.invalid} label="|θ| > θ_max" />
              <span className="key">● stable · ○ unstable equilibrium</span>
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Arm following the trajectory" />
          </div>
        </div>
        <p className="caption">Click anywhere in the phase portrait to release the arm from that state.</p>
        <div className={`status ${status.kind}`}>{status.text}</div>
        <div className="readouts">
          <Readout name="equilibrium θ*" value={standing.theta === null ? "none in range" : `${fmt(standing.theta, 3)} rad`} />
          <Readout name="K_eff" value={lin ? `${fmt(lin.Keff)} N m/rad` : "–"} />
          <Readout name="Ω (linear)" value={lin ? `${fmt(lin.omega, 3)} rad/s` : "–"} />
          <Readout name="period (linear)" value={lin ? `${fmt(lin.period, 3)} s` : "–"} />
        </div>
      </div>
    </section>
  );
}
