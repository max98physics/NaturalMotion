import { useState } from "react";
import type { Pressures } from "./physics/arm";
import { EnergyPumping } from "./sections/EnergyPumping";
import { EquilibriumMap } from "./sections/EquilibriumMap";
import { Funnels } from "./sections/Funnels";
import { Hero } from "./sections/Hero";
import { Model } from "./sections/Model";
import { Modes } from "./sections/Modes";
import { Outlook } from "./sections/Outlook";
import { Standing } from "./sections/Standing";

export function App() {
  // shared by the model, standing and map sections
  const [pressures, setPressures] = useState<Pressures>({ p1: 3, p2: 2 });
  return (
    <div className="page">
      <Hero />
      <main>
        <Model pressures={pressures} setPressures={setPressures} />
        <Standing pressures={pressures} setPressures={setPressures} />
        <EquilibriumMap pressures={pressures} setPressures={setPressures} />
        <EnergyPumping />
        <Funnels />
        <Modes />
        <Outlook />
      </main>
      <footer>
        All figures are simulated live in your browser (RK4, dt = 1 ms). Source on{" "}
        <a href="https://github.com/max98physics/NaturalMotion">GitHub</a>.
      </footer>
    </div>
  );
}
