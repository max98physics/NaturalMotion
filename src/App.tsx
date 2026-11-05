import { useState } from "react";
import { ThemeToggle } from "./components/ui";
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
      <div className="topbar">
        <ThemeToggle />
      </div>
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
        Computed in the browser with RK4, dt = 1 ms. Source code on{" "}
        <a href="https://github.com/max98physics/NaturalMotion">GitHub</a>.
      </footer>
    </div>
  );
}
