import { useEffect, useMemo, useRef } from "react";
import { Placeholder, Readout } from "../components/ui";
import { useCanvas } from "../lib/canvas";
import { isoline, strokeSegments, type Grid } from "../lib/contour";
import { drawAxes, fmt, invX, invY, makeFrame, sx, sy, type Frame } from "../lib/plot";
import { mix, usePalette, type Palette } from "../lib/theme";
import { useWorker } from "../lib/worker";
import { DEFAULT_ARM as P, minPressureSum, P_MAX, standingEquilibrium, thetaMax, type Pressures } from "../physics/arm";
import type { MapResult } from "../workers/compute.worker";

const N = 201;
const RANGE: [number, number] = [0, P_MAX];

/** Map image at grid resolution: diverging color for theta*, flat colors for the other regions. */
function renderMap(m: MapResult, pal: Palette): { image: HTMLCanvasElement; hatch: HTMLCanvasElement } {
  const tMax = thetaMax(P);
  const image = document.createElement("canvas");
  image.width = image.height = m.n;
  const ictx = image.getContext("2d")!;
  const img = ictx.createImageData(m.n, m.n);
  const mask = document.createElement("canvas");
  mask.width = mask.height = m.n;
  const mctx = mask.getContext("2d")!;
  const mimg = mctx.createImageData(m.n, m.n);
  const none = mix(pal.mapNone, pal.mapNone, 0);
  const surface = mix(pal.surface, pal.surface, 0);
  for (let j = 0; j < m.n; j++) {
    for (let i = 0; i < m.n; i++) {
      const src = j * m.n + i;
      const dst = ((m.n - 1 - j) * m.n + i) * 4; // image rows run top-down, p2 bottom-up
      const r = m.region[src];
      let c: [number, number, number];
      if (r === 0) {
        const t = Math.max(-1, Math.min(1, m.theta[src] / tMax));
        c = t < 0 ? mix(pal.divMid, pal.divNeg, -t) : mix(pal.divMid, pal.divPos, t);
      } else c = r === 1 ? surface : none;
      img.data.set([...c, 255], dst);
      if (r === 1) mimg.data.set([0, 0, 0, 255], dst);
    }
  }
  ictx.putImageData(img, 0, 0);
  mctx.putImageData(mimg, 0, 0);
  return { image, hatch: mask };
}

export function EquilibriumMap({ pressures, setPressures }: { pressures: Pressures; setPressures: (p: Pressures) => void }) {
  const pal = usePalette();
  const cv = useCanvas(1.08);
  const frameRef = useRef<Frame | null>(null);
  const dragging = useRef(false);
  const map = useWorker<MapResult>({ kind: "map", n: N }, `map${N}`);
  const rendered = useMemo(() => (map ? renderMap(map, pal) : null), [map, pal]);
  const contours = useMemo(() => {
    if (!map) return [];
    const g: Grid = { nx: N, ny: N, x: RANGE, y: RANGE, values: map.theta };
    return [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5].map((l) => ({ level: l, segs: isoline(g, l) }));
  }, [map]);
  const standing = standingEquilibrium(P, pressures);

  useEffect(() => {
    const ctx = cv.context();
    if (!ctx) return;
    const side = Math.min(cv.size.w - 70, cv.size.h - 52);
    const f = makeFrame(side + 64, side + 52, RANGE, RANGE, { left: 52, right: 12, top: 12, bottom: 40 });
    frameRef.current = f;
    if (rendered) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(rendered.image, f.left, f.top, f.width, f.height);
      // hatch the "only unstable" region
      const hatch = document.createElement("canvas");
      hatch.width = Math.ceil(f.width);
      hatch.height = Math.ceil(f.height);
      const hctx = hatch.getContext("2d")!;
      hctx.imageSmoothingEnabled = false;
      hctx.drawImage(rendered.hatch, 0, 0, hatch.width, hatch.height);
      hctx.globalCompositeOperation = "source-in";
      hctx.strokeStyle = pal.muted;
      hctx.lineWidth = 1;
      hctx.beginPath();
      for (let d = -hatch.height; d < hatch.width; d += 7) {
        hctx.moveTo(d, hatch.height);
        hctx.lineTo(d + hatch.height, 0);
      }
      hctx.stroke();
      ctx.drawImage(hatch, f.left, f.top);
      ctx.strokeStyle = pal.ink2;
      ctx.lineWidth = 0.8;
      for (const c of contours) strokeSegments(ctx, c.segs, (x, y) => [sx(f, x), sy(f, y)]);
    } else {
      ctx.fillStyle = pal.ink2;
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("computing equilibria …", f.left + f.width / 2, f.top + f.height / 2);
    }
    drawAxes(ctx, f, pal, { xLabel: "p₁ [bar]", yLabel: "p₂ [bar]", grid: false });
    // current pressures
    const x = sx(f, pressures.p1);
    const y = sy(f, pressures.p2);
    ctx.strokeStyle = pal.surface;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [cv, pal, rendered, contours, pressures]);

  const setFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = frameRef.current;
    if (!f) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(P_MAX, v)) * 20) / 20;
    setPressures({ p1: clamp(invX(f, e.clientX - rect.left)), p2: clamp(invY(f, e.clientY - rect.top)) });
  };

  const regionText = {
    stable: `Stable at θ* = ${fmt(standing.theta ?? NaN, 3)} rad.`,
    onlyUnstable: "Only unstable equilibria in the valid range.",
    none: "No equilibrium in the valid range.",
  }[standing.region];

  return (
    <section id="map">
      <h2>
        <span className="num">3</span>Equilibrium map
      </h2>
      <div className="prose">
        <Placeholder
          points={[
            "Each point is a pressure pair; the color is the angle where the arm comes to rest",
            "Hatched: the muscles are too soft to hold the arm against gravity",
            "Gray: the pressure difference pushes the equilibrium beyond the valid range",
            "The tip of the colored wedge sits at the minimum pressure sum; just below it a pair of off-centre equilibria appears (pitchfork)",
            "Lines of constant θ* are rays: θ* depends on the ratio of the pressures more than on their size",
          ]}
        />
      </div>
      <div className="figure">
        <div className="figure-grid">
          <div>
            <canvas
              ref={cv.ref}
              className="plot"
              style={{ cursor: "pointer" }}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                setFromPointer(e);
              }}
              onPointerMove={(e) => dragging.current && setFromPointer(e)}
              onPointerUp={() => (dragging.current = false)}
              role="img"
              aria-label="Map of the equilibrium angle over both muscle pressures; click to choose pressures"
            />
          </div>
          <div>
            <div className="control-group">
              <span>θ* [rad]</span>
              <div
                style={{
                  height: 12,
                  background: `linear-gradient(to right, ${pal.divNeg}, ${pal.divMid}, ${pal.divPos})`,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}>
                <span>−0.6</span>
                <span>0</span>
                <span>0.6</span>
              </div>
            </div>
            <div className="legend" style={{ flexDirection: "column" }}>
              <span className="key">
                <span
                  className="swatch"
                  style={{ background: `repeating-linear-gradient(-45deg, ${pal.muted} 0 1px, transparent 1px 4px)`, border: `1px solid ${pal.axis}` }}
                />
                only unstable equilibria
              </span>
              <span className="key">
                <span className="swatch" style={{ background: pal.mapNone, border: `1px solid ${pal.axis}` }} />
                no equilibrium in the valid range
              </span>
            </div>
            <div className="readouts">
              <Readout name="p₁ / p₂" value={`${fmt(pressures.p1)} / ${fmt(pressures.p2)} bar`} />
              <Readout name="minimum sum" value={`${fmt(minPressureSum(P), 3)} bar`} />
            </div>
            <div className={`status ${standing.region === "stable" ? "ok" : "fail"}`}>{regionText}</div>
            <p className="caption">Click or drag to set p₁ and p₂. Sections 1 and 2 use the same pressures.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
