import { P_MAX, type Pressures } from "../physics/arm";
import { Slider } from "./ui";

export function PressureSliders({ pressures, setPressures }: { pressures: Pressures; setPressures: (p: Pressures) => void }) {
  const f = (v: number) => `${v.toFixed(2)} bar`;
  return (
    <>
      <Slider label="p₁ (muscle 1)" value={pressures.p1} min={0} max={P_MAX} step={0.05} format={f} onChange={(p1) => setPressures({ ...pressures, p1 })} />
      <Slider label="p₂ (muscle 2)" value={pressures.p2} min={0} max={P_MAX} step={0.05} format={f} onChange={(p2) => setPressures({ ...pressures, p2 })} />
    </>
  );
}
