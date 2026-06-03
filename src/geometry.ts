interface Pt { x: number; y: number; }
type Shape = "square" | "pentagon" | "hexagon";

export interface Cell {
  key: string;
  r: number;
  c: number;
  cx: number;
  cy: number;
  corners: Pt[];
  rIn: number;
  edgeNeighbor?: (string | null)[];
  _wallLine?: SVGLineElement | null;
  _boxEl?: HTMLElement | null;
}

interface NeighborRef { key: string; ei: number; }
type NeighborAt = (r: number, c: number, ei: number) => string | null;

interface TilingBase {
  shape: Shape;
  rows: number;
  cols: number;
  sides: number;
  cells: Map<string, Cell>;
  width: number;
  height: number;
  neighborAt: NeighborAt;
}

export interface Tiling extends TilingBase {
  cellList: Cell[];
  boxSize: number;
  has(k: string): boolean;
  get(k: string): Cell | undefined;
  neighbors(k: string): NeighborRef[];
  neighborAcross(k: string, ei: number): string | null;
  validWalls(k: string): number[];
}

export const Geometry = (() => {
  const SQUARE = 50;
  const HEXR = 30;
  const PAD = 6;

  function makeCell(r: number, c: number, cx: number, cy: number, corners: Pt[], rIn: number): Cell {
    return { key: r + "," + c, r, c, cx, cy, corners, rIn };
  }

  function buildSquare(rows: number, cols: number): Tiling {
    const S = SQUARE, h = S / 2;
    const cells = new Map<string, Cell>();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = PAD + c * S + h, cy = PAD + r * S + h;
        const corners: Pt[] = [
          { x: cx - h, y: cy - h },
          { x: cx + h, y: cy - h },
          { x: cx + h, y: cy + h },
          { x: cx - h, y: cy + h },
        ];
        cells.set(r + "," + c, makeCell(r, c, cx, cy, corners, h));
      }
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // edges: top, right, bottom, left
    const neighborAt: NeighborAt = (r, c, ei) => {
      const [dc, dr] = dirs[ei];
      const k = (r + dr) + "," + (c + dc);
      return cells.has(k) ? k : null;
    };
    return finalize({
      shape: "square", rows, cols, cells, sides: 4, neighborAt,
      width: PAD * 2 + cols * S, height: PAD * 2 + rows * S,
    });
  }

  function buildHex(rows: number, cols: number): Tiling {
    const R = HEXR, w = Math.sqrt(3) * R;
    const cells = new Map<string, Cell>();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = PAD + w * (c + 0.5 * (r & 1)) + w / 2;
        const cy = PAD + 1.5 * R * r + R;
        const corners: Pt[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 180) * (60 * i - 30);
          corners.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
        }
        cells.set(r + "," + c, makeCell(r, c, cx, cy, corners, R * Math.sqrt(3) / 2));
      }
    const even = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]; // edges E, SE, SW, W, NW, NE
    const odd  = [[1, 0], [1, 1], [0, 1],  [-1, 0], [0, -1],  [1, -1]];
    const neighborAt: NeighborAt = (r, c, ei) => {
      const [dc, dr] = (r & 1) ? odd[ei] : even[ei];
      const k = (r + dr) + "," + (c + dc);
      return cells.has(k) ? k : null;
    };
    return finalize({
      shape: "hexagon", rows, cols, cells, sides: 6, neighborAt,
      width: PAD * 2 + w * cols + w / 2,
      height: PAD * 2 + 1.5 * R * (rows - 1) + 2 * R,
    });
  }

  // Cairo pentagonal tiling: one translational unit cell (4 pentagons, one per
  // orientation), rotated 45° to axis-align the lattice (period √6). Coordinates
  // precomputed and verified offline.
  const PENT_UNIT: number[][][] = [
    [[-0.69695318,-0.17931509],[-0.17931509,-0.69695318],[0.78661073,-0.43813414],[0.52779169,0.52779169],[-0.43813414,0.78661073]],
    [[0.52779169,-1.92169806],[1.04542978,-1.40405997],[0.78661073,-0.43813414],[-0.17931509,-0.69695318],[-0.43813414,-1.66287901]],
    [[1.04542978,-1.40405997],[0.52779169,-1.92169806],[0.78661073,-2.88762388],[1.75253656,-2.62880484],[2.0113556,-1.66287901]],
    [[2.27017465,-0.69695318],[1.75253656,-0.17931509],[0.78661073,-0.43813414],[1.04542978,-1.40405997],[2.0113556,-1.66287901]],
  ];
  const PENT_L = Math.sqrt(6);

  function buildPentagon(reqRows: number, reqCols: number): Tiling {
    const SCALE = 36;
    const KMAP = [[0, 0], [0, 1], [1, 0], [1, 1]];

    const P = Math.ceil(reqRows / 2), Q = Math.ceil(reqCols / 2);
    const rows = 2 * P, cols = 2 * Q;
    const raw: Cell[] = [];
    for (let pr = 0; pr < P; pr++)
      for (let pc = 0; pc < Q; pc++) {
        const ox = pc * PENT_L, oy = pr * PENT_L;
        for (let k = 0; k < 4; k++) {
          const corners: Pt[] = PENT_UNIT[k].map(([x, y]) => ({ x: (x + ox) * SCALE, y: (y + oy) * SCALE }));
          const [dr, dc] = KMAP[k];
          raw.push(makeCell(2 * pr + dr, 2 * pc + dc, 0, 0, corners, 0));
        }
      }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const cell of raw) for (const p of cell.corners) {
      minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
    }
    for (const cell of raw) for (const p of cell.corners) { p.x += PAD - minx; p.y += PAD - miny; }
    const width = (maxx - minx) + 2 * PAD, height = (maxy - miny) + 2 * PAD;

    const cells = new Map<string, Cell>();
    for (const cell of raw) {
      let sx = 0, sy = 0;
      for (const p of cell.corners) { sx += p.x; sy += p.y; }
      cell.cx = sx / 5; cell.cy = sy / 5;
      let rin = Infinity;
      for (let i = 0; i < 5; i++) {
        const a = cell.corners[i], b = cell.corners[(i + 1) % 5];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        rin = Math.min(rin, Math.abs((cell.cx - a.x) * dy - (cell.cy - a.y) * dx) / L);
      }
      cell.rIn = rin;
      cells.set(cell.key, cell);
    }
    const RD = 1e3, ck = (p: Pt) => Math.round(p.x * RD) / RD + "," + Math.round(p.y * RD) / RD;
    const ek = (a: Pt, b: Pt) => { const x = ck(a), y = ck(b); return x < y ? x + "|" + y : y + "|" + x; };
    const emap = new Map<string, Array<[string, number]>>();
    for (const cell of raw) for (let i = 0; i < 5; i++) {
      const e = ek(cell.corners[i], cell.corners[(i + 1) % 5]);
      if (!emap.has(e)) emap.set(e, []);
      emap.get(e)!.push([cell.key, i]);
    }
    for (const cell of raw) {
      cell.edgeNeighbor = [];
      for (let i = 0; i < 5; i++) {
        const e = ek(cell.corners[i], cell.corners[(i + 1) % 5]);
        const other = emap.get(e)!.find(([k]) => k !== cell.key);
        cell.edgeNeighbor[i] = other ? other[0] : null;
      }
    }
    const neighborAt: NeighborAt = (r, c, ei) => {
      const cell = cells.get(r + "," + c);
      return cell && cell.edgeNeighbor ? cell.edgeNeighbor[ei] : null;
    };
    return finalize({ shape: "pentagon", rows, cols, cells, sides: 5, neighborAt, width, height });
  }

  function finalize(base: TilingBase): Tiling {
    const t = base as Tiling;
    t.cellList = [...t.cells.values()];
    t.has = (k) => t.cells.has(k);
    t.get = (k) => t.cells.get(k);
    t.boxSize = Math.round(2 * t.cellList[0].rIn * 0.74);

    t.neighbors = (k) => {
      const cell = t.cells.get(k)!;
      const out: NeighborRef[] = [];
      for (let ei = 0; ei < t.sides; ei++) {
        const nk = t.neighborAt(cell.r, cell.c, ei);
        if (nk) out.push({ key: nk, ei });
      }
      return out;
    };
    t.neighborAcross = (k, ei) => {
      const cell = t.cells.get(k)!;
      return t.neighborAt(cell.r, cell.c, ei);
    };
    t.validWalls = (k) => {
      const cell = t.cells.get(k)!;
      const neigh: number[] = [];
      for (let ei = 0; ei < t.sides; ei++)
        if (t.neighborAt(cell.r, cell.c, ei) != null) neigh.push(ei);
      if (neigh.length >= 2) return neigh;
      if (neigh.length === 1) {
        const border: number[] = [];
        for (let ei = 0; ei < t.sides; ei++)
          if (t.neighborAt(cell.r, cell.c, ei) == null) border.push(ei);
        return border.length ? border : neigh;
      }
      return [];
    };
    return t;
  }

  function make(shape: string, rows: number, cols: number): Tiling {
    if (shape === "hexagon") return buildHex(rows, cols);
    if (shape === "pentagon") return buildPentagon(rows, cols);
    return buildSquare(rows, cols);
  }

  return { make, SHAPES: ["square", "pentagon", "hexagon"] as string[], SQUARE, HEXR };
})();
