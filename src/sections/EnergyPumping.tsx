import { useEffect, useMemo, useRef, useState } from "react";
import { drawArm } from "../components/drawArm";
import { LegendKey, Placeholder, Readout, Slider, TeX } from "../components/ui";
import { useAnimationLoop, useCanvas, useVisible } from "../lib/canvas";
import { clipToFrame, drawAxes, fmt, makeFrame, polyline, sx, sy } from "../lib/plot";
import { usePalette } from "../lib/theme";
import { DEFAULT_ARM } from "../physics/arm";
import {
  boundaryEnergy,
  dpMax,
  pressuresFromDifference,
  simulateEnergyControl,
  stationaryEnergy,
} from "../physics/energyControl";

const T = 90;

export function EnergyPumping() {
  const pal = usePalette();
  const energyPlot = useCanvas(2.4);
  const dpPlot = useCanvas(4.2);
  const arm = useCanvas(0.8);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const [target, setTarget] = useState(1);
  const [gamma, setGamma] = useState(0.5);
  const [b, setB] = useState(0.3);
  const P = useMemo(() => ({ ...DEFAULT_ARM, b }), [b]);
  const settings = { target, gamma, b };
  const run = useMemo(() => simulateEnergyControl(P, { target, gamma, b }, [0.01, 0], T), [P, target, gamma, b]);
  const Estar = stationaryEnergy(settings);
  const Eedge = boundaryEnergy(P);
  const replay = useRef(0); // replay time in s

  useEffect(() => {
    replay.current = 0;
  }, [run]);

  const drawStatic = () => {
    const ectx = energyPlot.context();
    if (ectx) {
      const f = makeFrame(energyPlot.size.w, energyPlot.size.h, [0, T], [0, 1.7], { left: 52, right: 12, top: 10, bottom: 36 });
      drawAxes(ectx, f, pal, { xLabel: "t [s]", yLabel: "E [J]" });
      ectx.save();
      clipToFrame(ectx, f);
      const hline = (v: number, color: string, dash: number[]) => {
        ectx.strokeStyle = color;
        ectx.setLineDash(dash);
        ectx.lineWidth = 1.5;
        ectx.beginPath();
        ectx.moveTo(f.left, sy(f, v));
        ectx.lineTo(f.left + f.width, sy(f, v));
        ectx.stroke();
      };
      hline(Eedge, pal.critical, [6, 4]);
      hline(target, pal.ink2, [6, 4]);
      if (Estar > 0) hline(Estar, pal.ink2, [2, 3]);
      ectx.setLineDash([]);
      ectx.strokeStyle = pal.s1;
      ectx.lineWidth = 1.5;
      const step = 20;
      const ts = run.t.filter((_, i) => i % step === 0);
      const Es = run.E.filter((_, i) => i % step === 0);
      polyline(ectx, f, ts, Es);
      ectx.stroke();
      if (run.failedAt !== null) {
        ectx.fillStyle = pal.critical;
        ectx.beginPath();
        ectx.arc(sx(f, run.failedAt), sy(f, run.E[run.E.length - 1]), 5, 0, 2 * Math.PI);
        ectx.fill();
      }
      ectx.restore();
    }
    const dctx = dpPlot.context();
    if (dctx) {
      // scale to the largest command, at least +-0.25 bar, at most the saturation limit
      const peak = run.dp.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      const lim = Math.min(dpMax(), Math.max(0.25, Math.ceil(peak * 1.2 * 4) / 4));
      const f = makeFrame(dpPlot.size.w, dpPlot.size.h, [0, T], [-lim, lim], { left: 52, right: 12, top: 6, bottom: 30 });
      drawAxes(dctx, f, pal, { yLabel: "Δp [bar]", yTicks: [-lim, 0, lim] });
      dctx.save();
      clipToFrame(dctx, f);
      dctx.strokeStyle = pal.s2;
      dctx.lineWidth = 1;
      const step = 10;
      polyline(dctx, f, run.t.filter((_, i) => i % step === 0), run.dp.filter((_, i) => i % step === 0));
      dctx.stroke();
      dctx.restore();
    }
  };

  const drawFrame = () => {
    drawStatic();
    const i = Math.min(run.t.length - 1, Math.round(replay.current / 1e-3));
    const actx = arm.context();
    if (actx) drawArm(actx, arm.size.w, arm.size.h, pal, P, { theta: run.theta[i], pressures: pressuresFromDifference(run.dp[i]) });
    // replay cursor in the energy plot
    const ectx = energyPlot.size.w ? energyPlot.ref.current?.getContext("2d") : null;
    if (ectx) {
      const f = makeFrame(energyPlot.size.w, energyPlot.size.h, [0, T], [0, 1.7], { left: 52, right: 12, top: 10, bottom: 36 });
      ectx.strokeStyle = pal.muted;
      ectx.lineWidth = 1;
      ectx.beginPath();
      ectx.moveTo(sx(f, run.t[i]), f.top);
      ectx.lineTo(sx(f, run.t[i]), f.top + f.height);
      ectx.stroke();
    }
  };

  useAnimationLoop(visible, (dt) => {
    replay.current += dt;
    const end = run.failedAt ?? T;
    if (replay.current > end + 1.5) replay.current = 0;
    drawFrame();
  });
  useEffect(drawFrame);

  // mean energy over the last two 5 s windows: settled if they agree
  const mean = (a: number[]) => a.reduce((s, e) => s + e, 0) / a.length;
  const settled = run.failedAt === null ? mean(run.E.slice(-5000)) : NaN;
  const before = run.failedAt === null ? mean(run.E.slice(-10000, -5000)) : NaN;
  const isSettled = Math.abs(settled - before) < 0.03 * Math.max(settled, 0.05);

  return (
    <section id="energy">
      <p className="kicker">4 · Pumping energy</p>
      <h2>Swinging by shifting the pressure difference</h2>
      <div className="prose">
        <Placeholder
          points={[
            "Keep the pressure sum at 5 bar (fixed stiffness) and use the difference Δp as the input: τ_m = −K θ + c_Δ Δp",
            "Energy relative to the upright rest state; the controller pushes in the direction of motion while E < Ē",
            "Lyapunov argument with V = ½ (Ē − E)²; the upright rest state becomes repelling",
            "Friction balances the injected power at E* = Ē − b/γ",
            "Above the energy of the valid-range edge the arm hits its limits",
          ]}
        />
        <TeX block>{String.raw`\Delta p = \operatorname{clip}\!\left(\frac{\gamma\,(\bar E - E)\,\dot\theta}{c_\Delta},\ \pm\Delta p_{\max}\right),\qquad \dot E = \gamma(\bar E - E)\,\dot\theta^2 - b\,\dot\theta^2`}</TeX>
      </div>
      <div className="figure" ref={wrap}>
        <div className="controls">
          <Slider label="target energy Ē" value={target} min={0.1} max={1.6} step={0.05} format={(v) => `${v.toFixed(2)} J`} onChange={setTarget} />
          <Slider label="gain γ" value={gamma} min={0.1} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={setGamma} />
          <Slider label="damping b" value={b} min={0} max={1} step={0.05} format={(v) => `${v.toFixed(2)} N m s`} onChange={setB} />
        </div>
        <div className="figure-grid">
          <div>
            <canvas ref={energyPlot.ref} className="plot" role="img" aria-label="Energy over time" />
            <canvas ref={dpPlot.ref} className="plot" role="img" aria-label="Pressure difference over time" />
            <div className="legend">
              <LegendKey kind="line" color={pal.s1} label="energy E" />
              <LegendKey kind="dash" color={pal.ink2} label="target Ē and prediction E*" />
              <LegendKey kind="dash" color={pal.critical} label="edge of the valid range" />
              <LegendKey kind="line" color={pal.s2} label="Δp" />
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Arm replaying the simulation" />
          </div>
        </div>
        <div className={`status ${run.failedAt !== null ? "fail" : isSettled ? "ok" : ""}`}>
          {run.failedAt !== null
            ? `Leaves the valid range after ${fmt(run.failedAt, 2)} s.`
            : isSettled
              ? `Settles on a stable swing at E ≈ ${fmt(settled, 3)} J.`
              : `Still changing after ${T} s (E ≈ ${fmt(settled, 3)} J).`}
        </div>
        <div className="readouts">
          <Readout name="prediction E*" value={`${fmt(Estar, 3)} J`} />
          <Readout name="simulated (last 5 s)" value={run.failedAt === null ? `${fmt(settled, 3)} J` : "–"} />
          <Readout name="edge energy" value={`${fmt(Eedge, 3)} J`} />
        </div>
      </div>
    </section>
  );
}
