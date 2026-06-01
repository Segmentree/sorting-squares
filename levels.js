/* Shared level format + storage, used by both the play page and the editor.
 * Exposed as a global `Levels` (no ES modules, so it works from file://).
 *
 * Level shape:
 *   { id, name, shape, rows, cols,
 *     slots: [{ r, c, wall }],   // shape: "square" | "hexagon"; wall = edge index
 *     boxes: [{ r, c }],
 *     updatedAt }
 *
 * Legacy levels stored a square "facing" (up/down/left/right) instead of a
 * wall edge index; those are still accepted and migrated by the game loader.
 */
const Levels = (() => {
  const KEY = "sortingSquares.levels";
  const SHAPES = ["square", "pentagon", "hexagon"];
  const SIDES = { square: 4, pentagon: 5, hexagon: 6 };
  const FACINGS = ["up", "down", "left", "right"];
  const SIZE_MIN = 2, SIZE_MAX = 16;

  function loadAll() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function persist(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function uid() {
    return "lvl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function list() { return loadAll(); }
  function get(id) { return loadAll().find((l) => l.id === id) || null; }

  function save(level) {
    const all = loadAll();
    if (!level.id) level.id = uid();
    level.updatedAt = Date.now();
    const i = all.findIndex((l) => l.id === level.id);
    if (i >= 0) all[i] = level; else all.push(level);
    persist(all);
    return level.id;
  }

  function remove(id) { persist(loadAll().filter((l) => l.id !== id)); }

  // The wall edge index for a slot, migrating legacy square facings if needed.
  const FACING_TO_WALL = { up: 2, down: 0, left: 1, right: 3 };
  function slotWall(s, shape) {
    if (isInt(s.wall, 0, SIDES[shape] - 1)) return s.wall;
    if (shape === "square" && FACINGS.includes(s.facing)) return FACING_TO_WALL[s.facing];
    return null;
  }

  // Returns { ok: true } or { ok: false, error: "..." }.
  function validate(level) {
    if (!level || typeof level !== "object") return err("Not a level object.");
    const shape = level.shape || "square";
    if (!SHAPES.includes(shape)) return err("Unknown cell shape.");
    const { rows, cols } = level;
    if (!isInt(rows, SIZE_MIN, SIZE_MAX)) return err(`rows must be ${SIZE_MIN}-${SIZE_MAX}.`);
    if (!isInt(cols, SIZE_MIN, SIZE_MAX)) return err(`cols must be ${SIZE_MIN}-${SIZE_MAX}.`);
    if (!Array.isArray(level.slots)) return err("slots must be an array.");
    if (!Array.isArray(level.boxes)) return err("boxes must be an array.");

    const seen = new Set();
    for (const s of level.slots) {
      if (!isInt(s.r, 0, rows - 1) || !isInt(s.c, 0, cols - 1)) return err("A slot is out of bounds.");
      if (slotWall(s, shape) == null) return err("A slot has an invalid wall.");
      const k = s.r + "," + s.c;
      if (seen.has(k)) return err("Two pieces share a cell.");
      seen.add(k);
    }
    for (const b of level.boxes) {
      if (!isInt(b.r, 0, rows - 1) || !isInt(b.c, 0, cols - 1)) return err("A box is out of bounds.");
      const k = b.r + "," + b.c;
      if (seen.has(k)) return err("Two pieces share a cell.");
      seen.add(k);
    }
    return { ok: true };
  }

  // Coerce an arbitrary parsed object into a clean level (or null if invalid).
  function normalize(obj) {
    if (!obj || typeof obj !== "object") return null;
    const shape = SHAPES.includes(obj.shape) ? obj.shape : "square";
    const level = {
      id: typeof obj.id === "string" ? obj.id : null,
      name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Untitled",
      shape,
      rows: obj.rows, cols: obj.cols,
      slots: Array.isArray(obj.slots)
        ? obj.slots.map((s) => ({ r: s.r, c: s.c, wall: slotWall(s, shape) }))
        : [],
      boxes: Array.isArray(obj.boxes) ? obj.boxes.map((b) => ({ r: b.r, c: b.c })) : [],
      updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
    };
    return validate(level).ok ? level : null;
  }

  // Import one level or an array of levels from JSON text. Always assigns
  // fresh ids so imports never clobber existing levels. Returns a summary.
  function importJSON(text) {
    let parsed;
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

  function download(text, filename) {
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

  function exportLevel(level) {
    download(JSON.stringify(level, null, 2), safeName(level.name) + ".json");
  }
  function exportAll() {
    download(JSON.stringify(loadAll(), null, 2), "sorting-squares-levels.json");
  }

  function safeName(name) {
    return (name || "level").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "level";
  }
  function isInt(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
  function err(msg) { return { ok: false, error: msg }; }

  return {
    KEY, SHAPES, SIDES, FACINGS, SIZE_MIN, SIZE_MAX,
    list, get, save, remove, validate, normalize,
    importJSON, exportLevel, exportAll, download,
  };
})();

// Make available to CommonJS for headless tests (ignored in the browser).
if (typeof module !== "undefined" && module.exports) module.exports = { Levels };
