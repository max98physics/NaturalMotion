import { useEffect, useMemo, useRef, useState } from "react";
import { drawArm } from "../components/drawArm";
import { LegendKey, Placeholder, Segmented, TeX } from "../components/ui";
import { useAnimationLoop, useCanvas, useVisible } from "../lib/canvas";
import { isoline, sampleGrid, strokeSegments, type Grid } from "../lib/contour";
import { clipToFrame, drawAxes, drawInvalidBands, fmt, makeFrame, marker, sx, sy } from "../lib/plot";
import { alpha, usePalette } from "../lib/theme";
import { useWorker } from "../lib/worker";
import { DEFAULT_ARM as P, thetaMax } from "../physics/arm";
import { lyapunov, makeBehaviours, prepares, simulateSwitching, type BehaviourId } from "../physics/funnels";
import type { BasinResult, WorkerRequest } from "../workers/compute.worker";

const TH: [number, number] = [-0.8, 0.8];
const OM: [number, number] = [-2.2, 2.2];
const BASIN_N = 121;
const IDS: BehaviourId[] = ["A", "C", "B"];
const T_RUN = 12;

type Plan = "direct" | "chain";

export function Funnels() {
  const pal = usePalette();
  const phase = useCanvas(1.45);
  const arm = useCanvas(0.8);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const [plan, setPlan] = useState<Plan>("chain");
  const [b, setB] = useState(0.3);
  const [showBasin, setShowBasin] = useState(false);
  const beh = useMemo(() => makeBehaviours(P), []);
  const color: Record<BehaviourId, string> = { A: pal.s1, B: pal.s2, C: pal.s3 };

  const run = useMemo(
    () => simulateSwitching(P, plan === "direct" ? ["A", "B"] : ["A", "C", "B"], b, { T: T_RUN, stopOnFailure: true }),
    [plan, b],
  );
  const replay = useRef(0);
  useEffect(() => {
    replay.current = 0;
  }, [run]);

  const funnels = useMemo(
    () =>
      IDS.map((id) => {
        const g: Grid = sampleGrid(141, 141, TH, OM, (th, om) =>
          Math.abs(th) > thetaMax(P) ? NaN : lyapunov(P, beh[id], th, om),
        );
        return { id, grid: g, segs: isoline(g, beh[id].level) };
      }),
    [beh],
  );

  const basinReq: WorkerRequest = { kind: "basin", behaviour: "B", b, theta: [-thetaMax(P), thetaMax(P)], omega: OM, nx: BASIN_N, ny: BASIN_N };
  const basin = useWorker<BasinResult>(showBasin ? basinReq : null, showBasin ? `basin${b}` : "off");
  const basinSegs = useMemo(() => {
    if (!basin) return null;
    const values = Float64Array.from(basin.inside);
    return isoline({ nx: basin.nx, ny: basin.ny, x: [-thetaMax(P), thetaMax(P)], y: OM, values }, 0.5);
  }, [basin]);

  const draw = () => {
    const ctx = phase.context();
    const i = Math.min(run.t.length - 1, Math.round(replay.current / 1e-3));
    if (ctx) {
      const f = makeFrame(phase.size.w, phase.size.h, TH, OM);
      drawAxes(ctx, f, pal, { xLabel: "θ [rad]", yLabel: "θ̇ [rad/s]", grid: false });
      ctx.save();
      clipToFrame(ctx, f);
      drawInvalidBands(ctx, f, pal, thetaMax(P));
      const toPx = (x: number, y: number): [number, number] => [sx(f, x), sy(f, y)];
      // funnels: filled sublevel sets drawn cell by cell, then the outline
      for (const fu of funnels) {
        const { nx, ny, values } = fu.grid;
        const cw = f.width / (nx - 1);
        const chh = f.height / (ny - 1);
        ctx.fillStyle = alpha(color[fu.id], 0.13);
        ctx.beginPath();
        for (let jj = 0; jj < ny; jj++)
          for (let ii = 0; ii < nx; ii++) {
            const v = values[jj * nx + ii];
            if (v < beh[fu.id].level) {
              const x = TH[0] + ((TH[1] - TH[0]) * ii) / (nx - 1);
              const y = OM[0] + ((OM[1] - OM[0]) * jj) / (ny - 1);
              ctx.rect(sx(f, x) - cw / 2, sy(f, y) - chh / 2, cw + 0.5, chh + 0.5);
            }
          }
        ctx.fill();
        ctx.strokeStyle = color[fu.id];
        ctx.lineWidth = 1.5;
        strokeSegments(ctx, fu.segs, toPx);
      }
      if (showBasin && basinSegs) {
        ctx.strokeStyle = pal.ink;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        strokeSegments(ctx, basinSegs, toPx);
        ctx.setLineDash([]);
      }
      // trajectory up to the replay time, colored by the active behaviour
      ctx.lineWidth = 2;
      for (let k = 1; k <= i; k += 5) {
        const k0 = Math.max(0, k - 5);
        ctx.strokeStyle = color[run.active[k]];
        ctx.beginPath();
        ctx.moveTo(sx(f, run.theta[k0]), sy(f, run.omega[k0]));
        ctx.lineTo(sx(f, run.theta[k]), sy(f, run.omega[k]));
        ctx.stroke();
      }
      for (const id of IDS) {
        const x = sx(f, beh[id].thetaStar);
        marker(ctx, x, sy(f, 0), 5, pal.ink, pal.ink);
        ctx.fillStyle = pal.ink;
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(id, x, sy(f, 0) - 12);
      }
      if (run.failedAt !== null && i === run.t.length - 1) {
        const x = sx(f, run.theta[i]);
        const y = sy(f, run.omega[i]);
        ctx.strokeStyle = pal.critical;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
        ctx.stroke();
      } else marker(ctx, sx(f, run.theta[i]), sy(f, run.omega[i]), 5, pal.surface, color[run.active[i]]);
      ctx.restore();
    }
    const actx = arm.context();
    if (actx) drawArm(actx, arm.size.w, arm.size.h, pal, P, { theta: run.theta[i], pressures: beh[run.active[i]].pressures, showRest: true });
  };

  useAnimationLoop(visible, (dt) => {
    replay.current += dt;
    if (replay.current > run.t[run.t.length - 1] + 2) replay.current = 0;
    draw();
  });
  useEffect(draw);

  const edge = (from: BehaviourId, to: BehaviourId) => {
    const ok = prepares(P, beh[from], beh[to]);
    const v = lyapunov(P, beh[to], beh[from].thetaStar, 0);
    return (
      <span className="node" style={{ borderColor: ok ? pal.good : pal.critical }}>
        {from} → {to}: V<sub>{to}</sub>({from}*) = {fmt(v, 3)} {ok ? "<" : ">"} c<sub>{to}</sub> = {fmt(beh[to].level, 3)} {ok ? "✓" : "✗"}
      </span>
    );
  };

  const eventText = run.events.map((e) => `switch to ${e.to} at ${fmt(e.t, 2)} s`).join(" · ");

  return (
    <section id="funnels">
      <p className="kicker">5 · Funnels</p>
      <h2>Switching postures safely</h2>
      <div className="prose">
        <Placeholder
          points={[
            "Three behaviours at 5 bar pressure sum: lean left (A), upright (C), lean right (B)",
            "Each behaviour's energy relative to its goal is a Lyapunov function; its sublevel set inside the valid range is a funnel",
            "A prepares B if A's goal lies inside B's funnel (Burridge, Rizzi, Koditschek 1999)",
            "Direct A → B is not prepared; the chain A → C → B is, and it works even without friction",
            "The funnel is a conservative estimate: compare it with the true basin found by simulation",
          ]}
        />
        <TeX block>{String.raw`V_i(\theta,\dot\theta) = E(\theta,\dot\theta;\,p_i) - E(\theta_i^*, 0;\,p_i),\qquad \mathcal F_i = \{V_i < c_i\},\qquad c_i = \min_\pm V_i(\pm\theta_{\max}, 0)`}</TeX>
      </div>
      <div className="figure" ref={wrap}>
        <div className="controls">
          <Segmented
            label="plan"
            value={plan}
            onChange={setPlan}
            options={[
              { value: "direct", label: "A → B direct" },
              { value: "chain", label: "A → C → B" },
            ]}
          />
          <Segmented
            label="damping b"
            value={b}
            onChange={setB}
            options={[
              { value: 0, label: "0" },
              { value: 0.3, label: "0.3" },
            ]}
          />
          <label className="control-group" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={showBasin} onChange={(e) => setShowBasin(e.target.checked)} />
            show true basin of B
          </label>
          <button className="action" onClick={() => (replay.current = 0)}>
            Replay
          </button>
        </div>
        <div className="figure-grid">
          <div>
            <canvas ref={phase.ref} className="plot" role="img" aria-label="Phase plane with the three funnels and the switching trajectory" />
            <div className="legend">
              <LegendKey color={alpha(pal.s1, 0.4)} label="funnel A" />
              <LegendKey color={alpha(pal.s3, 0.4)} label="funnel C" />
              <LegendKey color={alpha(pal.s2, 0.4)} label="funnel B" />
              {showBasin && <LegendKey kind="dash" color={pal.ink} label={basin ? "true basin of B (simulated)" : "computing basin …"} />}
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Arm during the switching" />
          </div>
        </div>
        <div className={`status ${run.failedAt === null ? "ok" : "fail"}`}>
          {eventText}
          {run.failedAt === null ? " · stays in the valid range" : ` · leaves the valid range at ${fmt(run.failedAt, 2)} s`}
        </div>
        <div className="prepares">
          {edge("A", "B")}
          {edge("A", "C")}
          {edge("C", "B")}
        </div>
      </div>
    </section>
  );
}
