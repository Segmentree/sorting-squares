import type { Tiling } from "./geometry.js";

export function colLabel(c: number): string { return String.fromCharCode(65 + c); }

function clusterAxis(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const ticks: number[] = [];
  let group: number[] = [];
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) {
      ticks.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [];
    }
    group.push(v);
  }
  if (group.length) ticks.push(group.reduce((a, b) => a + b, 0) / group.length);
  return ticks;
}

function nearestIdx(ticks: number[], v: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ticks.length; i++) {
    const d = Math.abs(ticks[i] - v);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export interface CoordLayout {
  cols: { pos: number; label: string }[];
  rows: { pos: number; label: string }[];
  index: Map<string, { col: number; row: number }>;
}

export function coordLayout(tiling: Tiling, shape: string, holes: Set<string>): CoordLayout {
  const index = new Map<string, { col: number; row: number }>();
  if (shape === "pentagon") {
    const visible = tiling.cellList.filter((c) => !holes.has(c.key));
    const tol = tiling.boxSize * 0.8;
    const xs = clusterAxis(visible.map((c) => c.cx), tol);
    const ys = clusterAxis(visible.map((c) => c.cy), tol);
    for (const c of visible) index.set(c.key, { col: nearestIdx(xs, c.cx), row: nearestIdx(ys, c.cy) });
    return {
      cols: xs.map((pos, i) => ({ pos, label: colLabel(i) })),
      rows: ys.map((pos, j) => ({ pos, label: String(j + 1) })),
      index,
    };
  }
  const cols: { pos: number; label: string }[] = [];
  for (let c = 0; c < tiling.cols; c++) {
    const cell = tiling.get("0," + c);
    if (cell) cols.push({ pos: cell.cx, label: colLabel(c) });
  }
  const rows: { pos: number; label: string }[] = [];
  for (let r = 0; r < tiling.rows; r++) {
    const cell = tiling.get(r + ",0");
    if (cell) rows.push({ pos: cell.cy, label: String(r + 1) });
  }
  for (const c of tiling.cellList) if (!holes.has(c.key)) index.set(c.key, { col: c.c, row: c.r });
  return { cols, rows, index };
}

export function coordOf(index: Map<string, { col: number; row: number }>, cellKey: string): string {
  const i = index.get(cellKey);
  return i ? colLabel(i.col) + (i.row + 1) : "";
}
