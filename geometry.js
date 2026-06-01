/* Tiling geometry for Sorting Squares.
 *
 * Exposes a global `Geometry.make(shape, rows, cols)` returning a tiling object
 * that the game/editor use without knowing the shape. Each tiling provides, per
 * cell (keyed "r,c"): pixel centre, polygon corners, the incircle radius (for
 * sizing boxes), and an ordered list of `sides` edges. Edge `i` runs from
 * corner[i] to corner[(i+1)%sides] and faces neighbour `neighborAt(r,c,i)`
 * (or null at the border). A slot's wall is simply one edge index, so the wall
 * bar and the impassable edge are the same thing for every shape.
 *
 * Currently implements square (4) and hexagon (6). Pentagon (5) — only the
 * irregular Cairo tiling actually tessellates — is planned next.
 */
const Geometry = (() => {
  const SQUARE = 50;   // square side, px
  const HEXR = 30;     // hexagon circumradius, px
  const PAD = 6;       // outer padding so edge walls aren't clipped

  function makeCell(r, c, cx, cy, corners, rIn) {
    return { key: r + "," + c, r, c, cx, cy, corners, rIn };
  }

  function buildSquare(rows, cols) {
    const S = SQUARE, h = S / 2;
    const cells = new Map();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = PAD + c * S + h, cy = PAD + r * S + h;
        const corners = [
          { x: cx - h, y: cy - h }, // 0 top-left
          { x: cx + h, y: cy - h }, // 1 top-right   -> edge0 = top
          { x: cx + h, y: cy + h }, // 2 bottom-right -> edge1 = right
          { x: cx - h, y: cy + h }, // 3 bottom-left  -> edge2 = bottom, edge3 = left
        ];
        cells.set(r + "," + c, makeCell(r, c, cx, cy, corners, h));
      }
    // edge order: top, right, bottom, left  → [dcol, drow]
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const neighborAt = (r, c, ei) => {
      const [dc, dr] = dirs[ei];
      const k = (r + dr) + "," + (c + dc);
      return cells.has(k) ? k : null;
    };
    return finalize({
      shape: "square", rows, cols, cells, sides: 4, neighborAt,
      width: PAD * 2 + cols * S, height: PAD * 2 + rows * S,
    });
  }

  function buildHex(rows, cols) {
    const R = HEXR, w = Math.sqrt(3) * R;
    const cells = new Map();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = PAD + w * (c + 0.5 * (r & 1)) + w / 2;
        const cy = PAD + 1.5 * R * r + R;
        const corners = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 180) * (60 * i - 30); // edge i faces angle 60*i
          corners.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
        }
        cells.set(r + "," + c, makeCell(r, c, cx, cy, corners, R * Math.sqrt(3) / 2));
      }
    // edge order E, SE, SW, W, NW, NE → [dcol, drow], depends on row parity
    const even = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
    const odd  = [[1, 0], [1, 1], [0, 1],  [-1, 0], [0, -1],  [1, -1]];
    const neighborAt = (r, c, ei) => {
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

  // True Cairo pentagonal tiling. The pentagon has angles 120,120,90,120,90
  // and sides [√3−1,1,1,1,1]; it tiles edge-to-edge in a 4-orientation
  // basketweave. UNIT below is one translational unit cell (4 pentagons, one
  // per orientation), already rotated 45° so the lattice is axis-aligned with
  // period √6. Each unit cell maps to a 2×2 logical block, so the board is a
  // full rows×cols rectangle (both rounded up to even). Adjacency is derived
  // from shared edges. (Coordinates precomputed/verified offline.)
  const PENT_UNIT = [
    [[-0.69695318,-0.17931509],[-0.17931509,-0.69695318],[0.78661073,-0.43813414],[0.52779169,0.52779169],[-0.43813414,0.78661073]],
    [[0.52779169,-1.92169806],[1.04542978,-1.40405997],[0.78661073,-0.43813414],[-0.17931509,-0.69695318],[-0.43813414,-1.66287901]],
    [[1.04542978,-1.40405997],[0.52779169,-1.92169806],[0.78661073,-2.88762388],[1.75253656,-2.62880484],[2.0113556,-1.66287901]],
    [[2.27017465,-0.69695318],[1.75253656,-0.17931509],[0.78661073,-0.43813414],[1.04542978,-1.40405997],[2.0113556,-1.66287901]],
  ];
  const PENT_L = Math.sqrt(6); // axis-aligned lattice period (in unit coords)

  function buildPentagon(reqRows, reqCols) {
    const SCALE = 26;
    const KMAP = [[0, 0], [0, 1], [1, 0], [1, 1]]; // unit-cell pentagon -> (dr,dc)

    const P = Math.ceil(reqRows / 2), Q = Math.ceil(reqCols / 2);
    const rows = 2 * P, cols = 2 * Q;
    const raw = [];
    for (let pr = 0; pr < P; pr++)
      for (let pc = 0; pc < Q; pc++) {
        const ox = pc * PENT_L, oy = pr * PENT_L;
        for (let k = 0; k < 4; k++) {
          const corners = PENT_UNIT[k].map(([x, y]) => ({ x: (x + ox) * SCALE, y: (y + oy) * SCALE }));
          const [dr, dc] = KMAP[k];
          raw.push({ r: 2 * pr + dr, c: 2 * pc + dc, corners });
        }
      }
    // shift so the top-left of the patch sits at PAD
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const cell of raw) for (const p of cell.corners) {
      minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
    }
    for (const cell of raw) for (const p of cell.corners) { p.x += PAD - minx; p.y += PAD - miny; }
    const width = (maxx - minx) + 2 * PAD, height = (maxy - miny) + 2 * PAD;

    const cells = new Map();
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
      cell.key = cell.r + "," + cell.c;
      cells.set(cell.key, cell);
    }
    // adjacency from shared edges
    const RD = 1e3, ck = (p) => Math.round(p.x * RD) / RD + "," + Math.round(p.y * RD) / RD;
    const ek = (a, b) => { const x = ck(a), y = ck(b); return x < y ? x + "|" + y : y + "|" + x; };
    const emap = new Map();
    for (const cell of raw) for (let i = 0; i < 5; i++) {
      const e = ek(cell.corners[i], cell.corners[(i + 1) % 5]);
      if (!emap.has(e)) emap.set(e, []);
      emap.get(e).push([cell.key, i]);
    }
    for (const cell of raw) {
      cell.edgeNeighbor = [];
      for (let i = 0; i < 5; i++) {
        const e = ek(cell.corners[i], cell.corners[(i + 1) % 5]);
        const other = emap.get(e).find(([k]) => k !== cell.key);
        cell.edgeNeighbor[i] = other ? other[0] : null;
      }
    }
    const neighborAt = (r, c, ei) => {
      const cell = cells.get(r + "," + c);
      return cell ? cell.edgeNeighbor[ei] : null;
    };
    return finalize({ shape: "pentagon", rows, cols, cells, sides: 5, neighborAt, width, height });
  }

  function finalize(t) {
    t.cellList = [...t.cells.values()];
    t.has = (k) => t.cells.has(k);
    t.get = (k) => t.cells.get(k);
    // Box size that fits comfortably inside any cell of this tiling.
    t.boxSize = Math.round(2 * t.cellList[0].rIn * 0.74);

    t.neighbors = (k) => {
      const cell = t.cells.get(k);
      const out = [];
      for (let ei = 0; ei < t.sides; ei++) {
        const nk = t.neighborAt(cell.r, cell.c, ei);
        if (nk) out.push({ key: nk, ei });
      }
      return out;
    };
    t.neighborAcross = (k, ei) => {
      const cell = t.cells.get(k);
      return t.neighborAt(cell.r, cell.c, ei);
    };
    // Edge indices that still leave the cell reachable if used as a wall.
    t.validWalls = (k) => {
      const cell = t.cells.get(k);
      const neigh = [];
      for (let ei = 0; ei < t.sides; ei++)
        if (t.neighborAt(cell.r, cell.c, ei) != null) neigh.push(ei);
      if (neigh.length >= 2) return neigh;            // wall a real edge, ≥1 stays open
      if (neigh.length === 1) {                        // only one way in: wall a border edge
        const border = [];
        for (let ei = 0; ei < t.sides; ei++)
          if (t.neighborAt(cell.r, cell.c, ei) == null) border.push(ei);
        return border.length ? border : neigh;
      }
      return [];                                       // isolated (shouldn't happen)
    };
    return t;
  }

  function make(shape, rows, cols) {
    if (shape === "hexagon") return buildHex(rows, cols);
    if (shape === "pentagon") return buildPentagon(rows, cols);
    return buildSquare(rows, cols);
  }

  return { make, SHAPES: ["square", "pentagon", "hexagon"], SQUARE, HEXR };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { Geometry };
