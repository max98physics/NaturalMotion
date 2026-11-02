/// <reference lib="webworker" />
import { DEFAULT_ARM as P, P_MAX, standingEquilibrium } from "../physics/arm";
import { basinGrid, makeBehaviours, type BehaviourId } from "../physics/funnels";

export type WorkerRequest =
  | { kind: "map"; n: number }
  | { kind: "basin"; behaviour: BehaviourId; b: number; theta: [number, number]; omega: [number, number]; nx: number; ny: number };

export interface MapResult {
  kind: "map";
  n: number;
  theta: Float64Array; // NaN where no stable equilibrium in range
  region: Uint8Array; // 0 stable, 1 only unstable, 2 none
}

export interface BasinResult {
  kind: "basin";
  key: string;
  nx: number;
  ny: number;
  inside: Uint8Array;
}

const REGION = { stable: 0, onlyUnstable: 1, none: 2 } as const;

export const basinKey = (r: Extract<WorkerRequest, { kind: "basin" }>) => `${r.behaviour}|${r.b}|${r.nx}x${r.ny}`;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.kind === "map") {
    const { n } = req;
    const theta = new Float64Array(n * n);
    const region = new Uint8Array(n * n);
    // row j = p2, column i = p1
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const eq = standingEquilibrium(P, { p1: (P_MAX * i) / (n - 1), p2: (P_MAX * j) / (n - 1) });
        theta[j * n + i] = eq.theta ?? NaN;
        region[j * n + i] = REGION[eq.region];
      }
    }
    const msg: MapResult = { kind: "map", n, theta, region };
    self.postMessage(msg, { transfer: [theta.buffer, region.buffer] });
  } else {
    const beh = makeBehaviours(P)[req.behaviour];
    const inside = basinGrid(P, beh, req.b, req.theta, req.omega, req.nx, req.ny);
    const msg: BasinResult = { kind: "basin", key: basinKey(req), nx: req.nx, ny: req.ny, inside };
    self.postMessage(msg, { transfer: [inside.buffer] });
  }
};
