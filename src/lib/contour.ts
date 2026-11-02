/** Scalar field sampled on a regular grid over x and y ranges (row-major, row = y). */
export interface Grid {
  nx: number;
  ny: number;
  x: [number, number];
  y: [number, number];
  values: Float64Array;
}

export function sampleGrid(nx: number, ny: number, x: [number, number], y: [number, number], f: (x: number, y: number) => number): Grid {
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const yv = y[0] + ((y[1] - y[0]) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) values[j * nx + i] = f(x[0] + ((x[1] - x[0]) * i) / (nx - 1), yv);
  }
  return { nx, ny, x, y, values };
}

/**
 * Isoline segments by marching squares, in data coordinates as a flat list
 * [x0, y0, x1, y1, ...]. Cells with a NaN corner are skipped.
 */
export function isoline(g: Grid, level: number): number[] {
  const { nx, ny, values: v } = g;
  const dx = (g.x[1] - g.x[0]) / (nx - 1);
  const dy = (g.y[1] - g.y[0]) / (ny - 1);
  const out: number[] = [];
  const cross = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = v[j * nx + i];
      const v10 = v[j * nx + i + 1];
      const v01 = v[(j + 1) * nx + i];
      const v11 = v[(j + 1) * nx + i + 1];
      if (Number.isNaN(v00 + v10 + v01 + v11)) continue;
      const pts: number[] = [];
      const x0 = g.x[0] + i * dx;
      const y0 = g.y[0] + j * dy;
      if (v00 < level !== v10 < level) pts.push(x0 + cross(v00, v10) * dx, y0);
      if (v10 < level !== v11 < level) pts.push(x0 + dx, y0 + cross(v10, v11) * dy);
      if (v01 < level !== v11 < level) pts.push(x0 + cross(v01, v11) * dx, y0 + dy);
      if (v00 < level !== v01 < level) pts.push(x0, y0 + cross(v00, v01) * dy);
      if (pts.length === 4) out.push(...pts);
      else if (pts.length === 8) out.push(...pts);
    }
  }
  return out;
}

export function strokeSegments(
  ctx: CanvasRenderingContext2D,
  segs: number[],
  toPx: (x: number, y: number) => [number, number],
) {
  ctx.beginPath();
  for (let k = 0; k < segs.length; k += 4) {
    const [ax, ay] = toPx(segs[k], segs[k + 1]);
    const [bx, by] = toPx(segs[k + 2], segs[k + 3]);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}
