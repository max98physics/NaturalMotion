import { useEffect, useMemo } from "react";
import { drawArm } from "../components/drawArm";
import { Placeholder, Readout, LegendKey, TeX } from "../components/ui";
import { PressureSliders } from "../components/PressureSliders";
import { useCanvas } from "../lib/canvas";
import { clipToFrame, drawAxes, drawInvalidBands, fmt, makeFrame, marker, sx, sy } from "../lib/plot";
import { usePalette } from "../lib/theme";
import {
  contractions,
  DEFAULT_ARM as P,
  equilibria,
  gravityStiffness,
  restAngle,
  standingEquilibrium,
  stiffness,
  thetaMax,
  type Pressures,
} from "../physics/arm";

const TH: [number, number] = [-1.2, 1.2];

export function Model({ pressures, setPressures }: { pressures: Pressures; setPressures: (p: Pressures) => void }) {
  const pal = usePalette();
  const torque = useCanvas(1.45);
  const arm = useCanvas(0.8);
  const K = stiffness(P, pressures);
  const th0 = restAngle(P, pressures);
  const eqs = useMemo(() => equilibria(P, pressures), [pressures]);
  const standing = useMemo(() => standingEquilibrium(P, pressures), [pressures]);
  const shown = standing.theta ?? th0;
  const [e1, e2] = contractions(P, shown);

  useEffect(() => {
    const ctx = torque.context();
    if (!ctx) return;
    const { w, h } = torque.size;
    const mgl = gravityStiffness(P);
    const f = makeFrame(w, h, TH, [-15, 15]);
    drawAxes(ctx, f, pal, { xLabel: "θ [rad]", yLabel: "torque [N m]" });
    ctx.save();
    clipToFrame(ctx, f);
    drawInvalidBands(ctx, f, pal, thetaMax(P));
    const curve = (fn: (th: number) => number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = TH[0] + ((TH[1] - TH[0]) * i) / 200;
        const x = sx(f, th);
        const y = sy(f, fn(th));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    curve((th) => mgl * Math.sin(th), pal.s1);
    curve((th) => K * (th - th0), pal.s2);
    for (const e of eqs) {
      if (e.theta < TH[0] || e.theta > TH[1]) continue;
      marker(ctx, sx(f, e.theta), sy(f, mgl * Math.sin(e.theta)), 6, pal.ink, e.stable ? pal.ink : pal.surface);
    }
    ctx.restore();
  }, [torque, pal, K, th0, eqs]);

  useEffect(() => {
    const ctx = arm.context();
    if (!ctx) return;
    drawArm(ctx, arm.size.w, arm.size.h, pal, P, { theta: shown, pressures, showRest: true, labels: true });
  }, [arm, pal, shown, pressures]);

  return (
    <section id="model">
      <h2>
        <span className="num">1</span>Model
      </h2>
      <div className="prose">
        <Placeholder
          points={[
            "The setup: rigid link of length l with point mass m, standing upright on a joint; pulley of radius r; two antagonistic pneumatic muscles of length L₀",
            "Muscle model: force falls linearly with contraction, F = k₀ p (1 − ε/ε_max)",
            "Rotating the joint by θ changes the contractions by ±rθ/L₀",
            "Result: the muscles act like a torsional spring whose stiffness is set by the pressure sum and whose rest angle is set by the pressure difference",
            "Gravity pushes the upright arm away from the vertical; the valid range |θ| ≤ 0.6 rad comes from 0 ≤ ε ≤ ε_max",
          ]}
        />
        <TeX block>
          {String.raw`\tau_m = r(F_1 - F_2) = -K(p)\,\bigl(\theta - \theta_0(p)\bigr),\qquad K = \kappa\,(p_1 + p_2),\qquad \theta_0 = C\,\frac{p_1 - p_2}{p_1 + p_2}`}
        </TeX>
        <TeX block>
          {String.raw`m l^2\,\ddot\theta = m g l \sin\theta - K\,(\theta - \theta_0) - b\,\dot\theta,\qquad \kappa = \frac{r^2 k_0}{L_0\,\varepsilon_{\max}},\quad C = \frac{L_0(\varepsilon_{\max} - \varepsilon_0)}{r}`}
        </TeX>
      </div>

      <div className="figure">
        <div className="controls">
          <PressureSliders pressures={pressures} setPressures={setPressures} />
        </div>
        <div className="figure-grid">
          <div>
            <canvas ref={torque.ref} className="plot" role="img" aria-label="Gravity torque and muscle restoring torque versus angle" />
            <div className="legend">
              <LegendKey kind="line" color={pal.s1} label="gravity m g l sin θ" />
              <LegendKey kind="line" color={pal.s2} label="muscle spring K (θ − θ₀)" />
              <LegendKey color={pal.invalid} label="outside valid range" />
              <span className="key">● stable</span>
              <span className="key">○ unstable</span>
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Arm at its equilibrium" />
            <p className="caption">Arm at θ*, dashed line at the rest angle θ₀.</p>
          </div>
        </div>
        <div className="readouts">
          <Readout name="stiffness K" value={`${fmt(K)} N m/rad`} />
          <Readout name="rest angle θ₀" value={`${fmt(th0, 3)} rad`} />
          <Readout name="equilibrium θ*" value={standing.theta === null ? "none in range" : `${fmt(standing.theta, 3)} rad`} />
          <Readout name="contraction ε₁ / ε₂" value={`${fmt(e1, 3)} / ${fmt(e2, 3)}`} />
        </div>
        <p className="caption">
          Equilibria lie at the intersections. They are stable where the muscle curve is steeper than the gravity curve.
        </p>
      </div>
    </section>
  );
}
