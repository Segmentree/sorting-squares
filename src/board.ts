import type { Tiling } from "./geometry.js";
import { coordLayout, coordOf } from "./coords.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = { x: 28, y: 24 };

export interface GridView {
  svg: SVGSVGElement;
  cellEls: Map<string, SVGPolygonElement>;
  pad: { x: number; y: number };
  coordOf(cellKey: string): string;
  highlight(cellKey: string, on: boolean): void;
}

export interface GridOpts {
  holes?: Set<string>;
  drawHoles?: boolean;
  onCellClick?(r: number, c: number): void;
  hover?: boolean;
}

export function renderGrid(boardEl: HTMLElement, tiling: Tiling, shape: string, opts: GridOpts = {}): GridView {
  const holes = opts.holes ?? new Set<string>();
  const drawHoles = opts.drawHoles ?? false;
  const hover = opts.hover ?? true;
  const pad = { ...PAD };

  boardEl.innerHTML = "";
  boardEl.style.width = tiling.width + pad.x + "px";
  boardEl.style.height = tiling.height + pad.y + "px";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(tiling.width + pad.x));
  svg.setAttribute("height", String(tiling.height + pad.y));
  svg.setAttribute("viewBox", `${-pad.x} ${-pad.y} ${tiling.width + pad.x} ${tiling.height + pad.y}`);
  svg.classList.add("board-svg");

  const layout = coordLayout(tiling, shape, holes);
  const colEls: SVGTextElement[] = [];
  const rowEls: SVGTextElement[] = [];

  const highlight = (cellKey: string, on: boolean): void => {
    const i = layout.index.get(cellKey);
    if (!i) return;
    colEls[i.col]?.classList.toggle("coord-hl", on);
    rowEls[i.row]?.classList.toggle("coord-hl", on);
  };

  const cellEls = new Map<string, SVGPolygonElement>();
  for (const cell of tiling.cellList) {
    if (holes.has(cell.key) && !drawHoles) continue;
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", cell.corners.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("class", "cell" + ((cell.r + cell.c) % 2 ? " alt" : ""));
    poly.dataset.key = cell.key;
    if (opts.onCellClick) {
      const fn = opts.onCellClick;
      poly.addEventListener("click", () => fn(cell.r, cell.c));
    }
    if (hover) {
      poly.addEventListener("mouseenter", () => highlight(cell.key, true));
      poly.addEventListener("mouseleave", () => highlight(cell.key, false));
    }
    svg.appendChild(poly);
    cellEls.set(cell.key, poly);
  }

  const text = (x: number, y: number, s: string): SVGTextElement => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("class", "grid-label");
    t.textContent = s;
    svg.appendChild(t);
    return t;
  };
  layout.cols.forEach((c, i) => (colEls[i] = text(c.pos, -pad.y / 2, c.label)));
  layout.rows.forEach((r, j) => (rowEls[j] = text(-pad.x / 2, r.pos, r.label)));

  boardEl.appendChild(svg);
  return { svg, cellEls, pad, coordOf: (k) => coordOf(layout.index, k), highlight };
}
