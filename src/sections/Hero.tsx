import { useEffect, useRef } from "react";
import { drawArm } from "../components/drawArm";
import { Placeholder } from "../components/ui";
import { prefersReducedMotion, useAnimationLoop, useCanvas, useVisible } from "../lib/canvas";
import { usePalette } from "../lib/theme";
import { armRhs, DEFAULT_ARM as P } from "../physics/arm";
import { controlLaw, pressuresFromDifference } from "../physics/energyControl";
import { rk4Step, type Vec } from "../physics/integrate";

const SETTINGS = { target: 0.75, gamma: 0.5, b: P.b };
const DT = 1e-3;

/** Title and an arm kept swinging by the energy controller of section 5. */
export function Hero() {
  const pal = usePalette();
  const { ref, size, context } = useCanvas(0.85);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const y = useRef<Vec>([0.02, 0]);
  const dp = useRef(0);

  const draw = () => {
    const ctx = context();
    if (!ctx) return;
    drawArm(ctx, size.w, size.h, pal, P, { theta: y.current[0], pressures: pressuresFromDifference(dp.current) });
  };

  useAnimationLoop(visible && !prefersReducedMotion(), (dt) => {
    for (let k = 0; k < Math.round(dt / DT); k++) {
      dp.current = controlLaw(P, SETTINGS, y.current[0], y.current[1]);
      y.current = rk4Step(armRhs(P, pressuresFromDifference(dp.current), SETTINGS.b), y.current, 0, DT);
    }
    draw();
  });
  useEffect(draw);

  return (
    <header className="hero">
      <div>
        <h1>Natural Motion</h1>
        <p className="tagline">
          Simulations of an arm driven by two antagonistic pneumatic muscles.
        </p>
        <Placeholder
          points={[
            "Who you are and why this page exists (PhD application, Robot Learning, JKU Linz)",
            "The idea in two sentences: postures as fixed points, rhythmic motions as invariant manifolds, transitions as funnels",
            "Working with gravity and the arm's own dynamics instead of fighting them",
            "How to read the page: every figure is a live simulation (RK4, dt = 1 ms), nothing is precomputed",
          ]}
        />
        <nav className="toc">
          <a href="#model">Model</a>
          <a href="#standing">Stability</a>
          <a href="#map">Equilibrium map</a>
          <a href="#energy">Energy control</a>
          <a href="#funnels">Funnels</a>
          <a href="#modes">Normal modes</a>
          <a href="#outlook">Outlook</a>
        </nav>
      </div>
      <div ref={wrap}>
        <canvas ref={ref} className="plot" role="img" aria-label="Animated arm swinging under energy control" />
        <p className="caption">Driven by the energy controller from section 4; the pressure sum stays at 5 bar.</p>
      </div>
    </header>
  );
}
