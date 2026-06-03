interface Pos { r: number; c: number; }
interface BoxDef { r: number; c: number; red?: boolean; tag?: Pos; }
interface SlotDef { r: number; c: number; wall?: number | null; facing?: string; }
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
type ValidateResult = { ok: true } | { ok: false; error: string };
interface ImportResult { added: number; skipped: number; error?: string; }

export const Levels = (() => {
  const KEY = "sortingSquares.levels";
  const SHAPES = ["square", "pentagon", "hexagon"];
  const SIDES: Record<string, number> = { square: 4, pentagon: 5, hexagon: 6 };
  const FACINGS = ["up", "down", "left", "right"];
  const SIZE_MIN = 2, SIZE_MAX = 16;

  function loadAll(): Level[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function persist(list: Level[]): void {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  function uid(): string {
    return "lvl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function list(): Level[] { return loadAll(); }
  function get(id: string): Level | null { return loadAll().find((l) => l.id === id) || null; }

  function save(level: Level): string {
    const all = loadAll();
    if (!level.id) level.id = uid();
    level.updatedAt = Date.now();
    const i = all.findIndex((l) => l.id === level.id);
    if (i >= 0) all[i] = level; else all.push(level);
    persist(all);
    return level.id;
  }

  function remove(id: string): void { persist(loadAll().filter((l) => l.id !== id)); }

  // Legacy square levels stored a "facing" instead of a wall edge index.
  const FACING_TO_WALL: Record<string, number> = { up: 2, down: 0, left: 1, right: 3 };
  function slotWall(s: SlotDef, shape: string): number | null {
    if (isInt(s.wall, 0, SIDES[shape] - 1)) return s.wall as number;
    if (shape === "square" && s.facing && FACINGS.includes(s.facing)) return FACING_TO_WALL[s.facing];
    return null;
  }

  function validate(level: any): ValidateResult {
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

  function normalize(obj: any): Level | null {
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

  function importJSON(text: string): ImportResult {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch (e) { return { added: 0, skipped: 0, error: "Invalid JSON." }; }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const all = loadAll();
    let added = 0, skipped = 0;
    for (const item of items) {
      const lvl = normalize(item);
      if (!lvl) { skipped++; continue; }
      lvl.id = uid();
      lvl.updatedAt = Date.now();
      all.push(lvl);
      added++;
    }
    persist(all);
    return { added, skipped };
  }

  function download(text: string, filename: string): void {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportLevel(level: Level): void {
    download(JSON.stringify(level, null, 2), safeName(level.name) + ".json");
  }
  function exportAll(): void {
    download(JSON.stringify(loadAll(), null, 2), "sorting-squares-levels.json");
  }

  function safeName(name: string): string {
    return (name || "level").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "level";
  }
  function isInt(v: any, lo: number, hi: number): boolean { return Number.isInteger(v) && v >= lo && v <= hi; }
  function err(msg: string): ValidateResult { return { ok: false, error: msg }; }

  const fsSupported = typeof window !== "undefined" && "showSaveFilePicker" in window;
  const HANDLE_DB = "sortingSquares.fs", HANDLE_STORE = "handles", HANDLE_KEY = "library";
  let boundHandle: any = null; // FileSystemFileHandle once linked

  function idbOpen(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function handleGet(): Promise<any> {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const r = db.transaction(HANDLE_STORE, "readonly").objectStore(HANDLE_STORE).get(HANDLE_KEY);
        r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
      });
    } catch (e) { return null; }
  }
  async function handleSet(h: any): Promise<void> {
    try {
      const db = await idbOpen();
      await new Promise<void>((res, rej) => {
        const r = db.transaction(HANDLE_STORE, "readwrite").objectStore(HANDLE_STORE).put(h, HANDLE_KEY);
        r.onsuccess = () => res(); r.onerror = () => rej(r.error);
      });
    } catch (e) {}
  }

  async function hasPermission(mode: "read" | "readwrite", request: boolean): Promise<boolean> {
    if (!boundHandle) return false;
    const opts = { mode };
    try {
      if ((await boundHandle.queryPermission(opts)) === "granted") return true;
      if (!request) return false;
      return (await boundHandle.requestPermission(opts)) === "granted";
    } catch (e) { return false; }
  }

  function loadFromText(text: string): number {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch (e) { return 0; }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const out: Level[] = [];
    for (const item of items) {
      const lvl = normalize(item);
      if (lvl) { if (!lvl.id) lvl.id = uid(); out.push(lvl); }
    }
    persist(out);
    return out.length;
  }

  async function writeFile(request = false): Promise<boolean> {
    if (!boundHandle || !(await hasPermission("readwrite", request))) return false;
    const w = await boundHandle.createWritable();
    await w.write(JSON.stringify(loadAll(), null, 2));
    await w.close();
    return true;
  }

  async function bindNew(): Promise<string | null> {
    if (!fsSupported) return null;
    const handle = await window.showSaveFilePicker!({
      suggestedName: "sorting-squares-levels.json",
      types: [{ description: "Sorting Squares levels", accept: { "application/json": [".json"] } }],
    });
    boundHandle = handle;
    await handleSet(handle);
    await writeFile(true);
    return handle.name;
  }

  async function openFile(): Promise<{ name: string; loaded: number } | null> {
    if (!fsSupported) return null;
    const [handle] = await window.showOpenFilePicker!({
      types: [{ description: "Sorting Squares levels", accept: { "application/json": [".json"] } }],
      multiple: false,
    });
    boundHandle = handle;
    await handleSet(handle);
    const loaded = loadFromText(await (await handle.getFile()).text());
    return { name: handle.name, loaded };
  }

  async function reconnect(): Promise<{ name: string; ready: boolean } | null> {
    if (!fsSupported) return null;
    const h = await handleGet();
    if (!h) return null;
    boundHandle = h;
    let ready = false;
    try { ready = (await h.queryPermission({ mode: "read" })) === "granted"; } catch (e) { ready = false; }
    if (ready) { try { loadFromText(await (await h.getFile()).text()); } catch (e) {} }
    return { name: h.name, ready };
  }

  async function pull(): Promise<{ name: string; loaded: number } | null> {
    if (!boundHandle || !(await hasPermission("read", true))) return null;
    const loaded = loadFromText(await (await boundHandle.getFile()).text());
    return { name: boundHandle.name, loaded };
  }

  function linkedName(): string | null { return boundHandle ? boundHandle.name : null; }

  const fs = { supported: fsSupported, bindNew, openFile, reconnect, pull, writeFile, linkedName };

  return {
    KEY, SHAPES, SIDES, FACINGS, SIZE_MIN, SIZE_MAX,
    list, get, save, remove, validate, normalize,
    importJSON, exportLevel, exportAll, download, fs,
  };
})();
