import { useEffect, useMemo, useRef, useState } from "react";
import { drawDoubleArm } from "../components/drawArm";
import { LegendKey, Placeholder, Readout, Segmented } from "../components/ui";
import { useCanvas, useVisible } from "../lib/canvas";
import { fmt } from "../lib/plot";
import { usePalette } from "../lib/theme";
import { DEFAULT_DOUBLE, doubleEnergy, type JointTorques, type ModeId } from "../physics/doublePendulum";
import { drawConfigPlane, familiesFor, useDoubleArmSim } from "./Modes";

const K = 10;
const KICK = { torque: 4, duration: 0.15 }; // N m, s

/** Sandbox: start on a mode, kick a joint, and watch the motion leave the mode. */
export function Outlook() {
  const pal = usePalette();
  const plane = useCanvas(1.25);
  const arm = useCanvas(0.95);
  const { ref: wrap, visible } = useVisible<HTMLDivElement>();
  const [damping, setDamping] = useState(0);
  const P = useMemo(() => ({ ...DEFAULT_DOUBLE, k1: K, k2: K, b: damping }), [damping]);
  const fam = useMemo(() => familiesFor(K), []);
  const kick = useRef<{ joint: 0 | 1; until: number } | null>(null);
  const [energy, setEnergy] = useState(0);

  const torques: JointTorques = (t) => {
    const kk = kick.current;
    if (!kk || t > kk.until) return [0, 0];
    return kk.joint === 0 ? [KICK.torque, 0] : [0, KICK.torque];
  };

  const draw = () => {
    const s = sim.current;
    const pctx = plane.context();
    if (pctx) drawConfigPlane(pctx, plane.size.w, plane.size.h, pal, P, fam, null, s.trace, s.y);
    const actx = arm.context();
    if (actx) drawDoubleArm(actx, arm.size.w, arm.size.h, pal, s.y[0], s.y[1], s.trace.slice(-300));
  };
  const frame = () => {
    draw();
    const s = sim.current;
    if (Math.round(s.t * 10) % 3 === 0) setEnergy(doubleEnergy(P, s.y));
  };
  const { sim, restart } = useDoubleArmSim(P, visible, frame, torques);
  useEffect(draw);

  const startOn = (mode: ModeId) => {
    const list = fam[mode];
    const m = list[Math.min(list.length - 1, mode === "slow" ? 9 : 3)];
    kick.current = null;
    restart([m.a, m.b, 0, 0]);
  };
  useEffect(() => startOn("slow"), []);

  const doKick = (joint: 0 | 1) => {
    kick.current = { joint, until: sim.current.t + KICK.duration };
  };

  return (
    <section id="outlook">
      <h2>
        <span className="num">7</span>Outlook
      </h2>
      <div className="prose">
        <Placeholder
          points={[
            "Postures are fixed points, rhythmic motions are eigenmanifolds; switching between them is the open problem",
            "Question 1: compute or learn the family of eigenmanifolds M(p) of a muscle-driven robot despite an inaccurate, dissipative model",
            "Question 2: does an agent learn faster and more robustly in a physical action space (equilibrium, stiffness, energy, mode) than in raw pressures?",
            "Question 3: find basins of attraction on real hardware to chain transitions safely",
            "What the sandbox shows: a short torque pulse throws the arm off its mode; a controller would have to steer it onto the other surface",
          ]}
        />
      </div>
      <div className="figure" ref={wrap}>
        <div className="controls">
          <button className="action" onClick={() => startOn("slow")}>
            Start in phase
          </button>
          <button className="action" onClick={() => startOn("fast")}>
            Start anti-phase
          </button>
          <button className="action primary" onClick={() => doKick(0)}>
            Kick shoulder
          </button>
          <button className="action primary" onClick={() => doKick(1)}>
            Kick elbow
          </button>
          <Segmented
            label="damping b"
            value={damping}
            onChange={setDamping}
            options={[
              { value: 0, label: "0" },
              { value: 0.1, label: "0.1" },
            ]}
          />
        </div>
        <div className="figure-grid even">
          <div>
            <canvas ref={plane.ref} className="plot" role="img" aria-label="Configuration plane with both mode families and the live trace" />
            <div className="legend">
              <LegendKey kind="line" color={pal.s1} label="in-phase family" />
              <LegendKey kind="line" color={pal.s2} label="anti-phase family" />
              <LegendKey kind="line" color={pal.ink} label="motion, last 8 s" />
            </div>
          </div>
          <div>
            <canvas ref={arm.ref} className="plot" role="img" aria-label="Animated double arm" />
          </div>
        </div>
        <div className="readouts">
          <Readout name="energy" value={`${fmt(energy, 3)} J`} />
          <Readout name="springs" value={`k₁ = k₂ = ${K} N m/rad`} />
          <Readout name="kick" value={`${KICK.torque} N m for ${KICK.duration} s`} />
        </div>
        <p className="caption">A kick is a short torque pulse on one joint. Afterwards the trajectory no longer follows a single curve.</p>
      </div>
    </section>
  );
}
