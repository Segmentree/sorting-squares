export interface Pos { r: number; c: number; }
export interface BoxDef { r: number; c: number; red?: boolean; tag?: Pos; }
export interface SlotDef { r: number; c: number; wall?: number | null; facing?: string; }
export interface Level {
  id: string | null;
  name: string;
  shape: string;
  rows: number;
  cols: number;
  slots: SlotDef[];
  boxes: BoxDef[];
  holes: Pos[];   // invisible impassable cells
  solids: Pos[];  // visible impassable cells
  updatedAt: number;
}
export type ValidateResult = { ok: true } | { ok: false; error: string };
export interface ImportResult { added: number; skipped: number; error?: string; }

export const SHAPES = ["square", "pentagon", "hexagon"];
export const SIDES: Record<string, number> = { square: 4, pentagon: 5, hexagon: 6 };
export const FACINGS = ["up", "down", "left", "right"];
export const SIZE_MIN = 2, SIZE_MAX = 16;

const FACING_TO_WALL: Record<string, number> = { up: 2, down: 0, left: 1, right: 3 };

function isInt(v: any, lo: number, hi: number): boolean { return Number.isInteger(v) && v >= lo && v <= hi; }
function err(msg: string): ValidateResult { return { ok: false, error: msg }; }

// Legacy square levels stored a "facing" instead of a wall edge index.
export function slotWall(s: SlotDef, shape: string): number | null {
  if (isInt(s.wall, 0, SIDES[shape] - 1)) return s.wall as number;
  if (shape === "square" && s.facing && FACINGS.includes(s.facing)) return FACING_TO_WALL[s.facing];
  return null;
}

export function validate(level: any): ValidateResult {
  if (!level || typeof level !== "object") return err("Not a level object.");
  const shape = level.shape || "square";
  if (!SHAPES.includes(shape)) return err("Unknown cell shape.");
  const { rows, cols } = level;
  if (!isInt(rows, SIZE_MIN, SIZE_MAX)) return err(`rows must be ${SIZE_MIN}-${SIZE_MAX}.`);
  if (!isInt(cols, SIZE_MIN, SIZE_MAX)) return err(`cols must be ${SIZE_MIN}-${SIZE_MAX}.`);
  if (!Array.isArray(level.slots)) return err("slots must be an array.");
  if (!Array.isArray(level.boxes)) return err("boxes must be an array.");
  if (level.holes != null && !Array.isArray(level.holes)) return err("holes must be an array.");
  if (level.solids != null && !Array.isArray(level.solids)) return err("solids must be an array.");

  const seen = new Set<string>();
  for (const h of level.holes || []) {
    if (!isInt(h.r, 0, rows - 1) || !isInt(h.c, 0, cols - 1)) return err("A hole is out of bounds.");
    seen.add(h.r + "," + h.c);
  }
  for (const s of level.solids || []) {
    if (!isInt(s.r, 0, rows - 1) || !isInt(s.c, 0, cols - 1)) return err("A solid is out of bounds.");
    seen.add(s.r + "," + s.c);
  }
  const slotKeys = new Set<string>();
  for (const s of level.slots) {
    if (!isInt(s.r, 0, rows - 1) || !isInt(s.c, 0, cols - 1)) return err("A slot is out of bounds.");
    if (slotWall(s, shape) == null) return err("A slot has an invalid wall.");
    const k = s.r + "," + s.c;
    if (seen.has(k)) return err("Two pieces share a cell.");
    seen.add(k);
    slotKeys.add(k);
  }
  for (const b of level.boxes) {
    if (!isInt(b.r, 0, rows - 1) || !isInt(b.c, 0, cols - 1)) return err("A box is out of bounds.");
    if (b.tag && !slotKeys.has(b.tag.r + "," + b.tag.c)) return err("A box tag must point to a slot.");
    const k = b.r + "," + b.c;
    if (seen.has(k)) return err("Two pieces share a cell.");
    seen.add(k);
  }
  return { ok: true };
}

export function normalize(obj: any): Level | null {
  if (!obj || typeof obj !== "object") return null;
  const shape = SHAPES.includes(obj.shape) ? obj.shape : "square";
  const slots = Array.isArray(obj.slots)
    ? obj.slots.map((s: SlotDef) => ({ r: s.r, c: s.c, wall: slotWall(s, shape) }))
    : [];
  const slotKeys = new Set(slots.map((s: SlotDef) => s.r + "," + s.c));
  const boxes: BoxDef[] = Array.isArray(obj.boxes)
    ? obj.boxes.map((b: BoxDef) => {
        const box: BoxDef = { r: b.r, c: b.c };
        if (b.red) box.red = true;
        if (b.tag && slotKeys.has(b.tag.r + "," + b.tag.c)) box.tag = { r: b.tag.r, c: b.tag.c };
        return box;
      })
    : [];
  const level: Level = {
    id: typeof obj.id === "string" ? obj.id : null,
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Untitled",
    shape,
    rows: obj.rows, cols: obj.cols,
    slots, boxes,
    holes: Array.isArray(obj.holes) ? obj.holes.map((h: Pos) => ({ r: h.r, c: h.c })) : [],
    solids: Array.isArray(obj.solids) ? obj.solids.map((s: Pos) => ({ r: s.r, c: s.c })) : [],
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
  };
  return validate(level).ok ? level : null;
}
