# Natural Motion

Simulations of an arm driven by two pneumatic muscles: equilibria, energy control, funnels and nonlinear normal modes.
All figures are computed in the browser (RK4, dt = 1 ms).

Live at [naturalmotion.maximiliankeim.dev](https://naturalmotion.maximiliankeim.dev).

## Structure

- `src/physics/` – the model in plain TypeScript, independent of the UI: single arm (`arm.ts`), energy shaping (`energyControl.ts`), funnels (`funnels.ts`), hanging double arm and nonlinear normal modes by shooting (`doublePendulum.ts`), RK4 (`integrate.ts`).
- `src/physics/physics.test.ts` – checks the physics against reference values (equilibria, stability limit, periods, energy controller, mode shooting, funnel levels).
- `src/sections/` – one React component per section of the page.
- `src/workers/` – heavy grids (equilibrium map, simulated basin) run in a Web Worker.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # physics tests
npm run build    # type check + production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
