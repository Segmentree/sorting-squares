/* Sorting Squares
 * Move every green box onto a yellow slot. A slot has a dark wall on its
 * "back" side and can only be entered from the front or the two laterals.
 * Boxes find a path through empty cells; static boxes block the way, but
 * boxes that are currently moving do not (they simply pass through).
 *
 * Entry module for the play page (loaded via <script type="module">). The IIFE
 * is now just scoping sugar — module scope already isolates these names.
 */
import { Geometry, type Tiling, type Cell } from "./geometry.js";
import { Levels, type Level } from "./levels.js";
import { gotoView, routeParams } from "./nav.js";

(() => {
  type BoxState = "idle" | "moving" | "placed";
  interface Slot { r: number; c: number; wall: number; filled: boolean; reserved: boolean; el: SVGPolygonElement; wallLine?: SVGLineElement; }
  interface Box { id: number; r: number; c: number; state: BoxState; target: Slot | null; red: boolean; el: HTMLElement; }
  interface RC { r: number; c: number; }
  interface BoxRC { r: number; c: number; red?: boolean; }
  interface Spec { shape: string; rows: number; cols: number; slots: Array<{ r: number; c: number; wall: number }>; boxes: BoxRC[]; holes?: RC[]; solids?: RC[]; }

  const STEP_MS = 130; // animation time per cell stepped
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Grid dimensions / shape — set by newGame() from the sidebar config.
  let ROWS = 10;
  let COLS = 10;
  let SHAPE = "square";
  let tiling: Tiling = null as unknown as Tiling; // current Geometry tiling
  let boardSvg: SVGSVGElement;

  const CONFIG = { rows: 10, cols: 10, boxes: 6, reds: 0, slots: 6, solids: 0, shape: "square" };
  const LIMITS = { rows: [2, 16] as [number, number], cols: [2, 16] as [number, number] };

  const boardEl = document.getElementById("board")!;
  const statusEl = document.getElementById("status")!;
  const placedEl = document.getElementById("placed")!;
  const totalEl = document.getElementById("total")!;
  const winEl = document.getElementById("win")!;

  let cellEls = new Map<string, SVGPolygonElement>();
  let slots: Slot[] = [];
  let boxes: Box[] = [];
  let selectedBox: Box | null = null;
  let wallEdges = new Set<string>(); // impassable edges between a slot and the cell behind its wall
  let holes = new Set<string>();     // invisible cells: not drawn, impassable (permanent obstacles)
  let solids = new Set<string>();    // visible cells: drawn as a solid block, impassable for every box

  function key(r: number, c: number): string { return r + "," + c; }
  function cellExists(r: number, c: number): boolean { return tiling.has(key(r, c)); }
  function centerOf(r: number, c: number): { cx: number; cy: number } {
    const cell = tiling.get(key(r, c))!;
    return { cx: cell.cx, cy: cell.cy };
  }

  // Undirected edge between two cells, by their string keys; order-independent.
  function edgeKeyK(a: string, b: string): string { return a < b ? a + "|" + b : b + "|" + a; }

  /* ---------- Board construction (SVG) ---------- */

  function buildBoard(): void {
    boardEl.innerHTML = "";
    boardEl.style.width = tiling.width + "px";
    boardEl.style.height = tiling.height + "px";
    cellEls = new Map();

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(tiling.width));
    svg.setAttribute("height", String(tiling.height));
    svg.setAttribute("viewBox", `0 0 ${tiling.width} ${tiling.height}`);
    svg.classList.add("board-svg");

    for (const cell of tiling.cellList) {
      if (holes.has(cell.key)) continue; // invisible cell — not drawn
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", cell.corners.map((p) => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("class", "cell" + ((cell.r + cell.c) % 2 ? " alt" : "") + (solids.has(cell.key) ? " solid" : ""));
      poly.dataset.key = cell.key;
      poly.addEventListener("click", () => onCellClick(cell.r, cell.c));
      svg.appendChild(poly);
      cellEls.set(cell.key, poly);
    }
    boardEl.appendChild(svg);
    boardSvg = svg;
  }

  /* ---------- Level generation ---------- */

  function randInt(n: number): number { return Math.floor(Math.random() * n); }

  // Add one slot (with its wall edge) from a {r,c,wall} spec.
  function addSlot(r: number, c: number, wall: number): Slot {
    const slot: Slot = { r, c, wall, filled: false, reserved: false, el: cellEls.get(key(r, c))! };
    slots.push(slot);
    decorateSlot(slot);
    // The wall blocks the edge between the slot and the cell across that edge.
    const nk = tiling.neighborAcross(key(r, c), wall);
    if (nk) wallEdges.add(edgeKeyK(key(r, c), nk));
    return slot;
  }

  // Add one box at (r,c). Red boxes (red=true) pass through other boxes.
  function addBox(r: number, c: number, red = false): Box {
    const box: Box = { id: boxes.length, r, c, state: "idle", target: null, red, el: null as unknown as HTMLElement };
    box.el = makeBoxEl(box);
    if (red) box.el.classList.add("red");
    boardEl.appendChild(box.el);
    positionBox(box);
    boxes.push(box);
    return box;
  }

  // Build the board from a spec.
  function buildSpec(spec: Spec): void {
    SHAPE = Geometry.SHAPES.includes(spec.shape) ? spec.shape : "square";
    tiling = Geometry.make(SHAPE, spec.rows, spec.cols);
    ROWS = tiling.rows; // pentagon rounds up to even
    COLS = tiling.cols;

    // Invisible cells — not drawn, and permanent obstacles for pathfinding.
    holes = new Set();
    for (const h of spec.holes || []) {
      if (cellExists(h.r, h.c)) holes.add(key(h.r, h.c));
    }
    // Solid cells — drawn as a block, permanent obstacles for every box.
    solids = new Set();
    for (const s of spec.solids || []) {
      if (cellExists(s.r, s.c) && !holes.has(key(s.r, s.c))) solids.add(key(s.r, s.c));
    }

    buildBoard();
    slots = [];
    boxes = [];
    wallEdges = new Set();
    selectedBox = null;
    winEl.classList.add("hidden");

    const blockedCell = (r: number, c: number) => holes.has(key(r, c)) || solids.has(key(r, c));
    for (const s of spec.slots) {
      if (cellExists(s.r, s.c) && !blockedCell(s.r, s.c)) addSlot(s.r, s.c, clampWall(s.wall));
    }
    for (const b of spec.boxes) {
      if (cellExists(b.r, b.c) && !blockedCell(b.r, b.c)) addBox(b.r, b.c, !!b.red);
    }

    const goals = goalBoxes().length; // red boxes aren't goals
    totalEl.textContent = String(goals);
    updatePlacedCount();

    if (goals === 0 || slots.length === 0) {
      setStatus("This level has no green boxes or no slots.");
    } else if (goals > slots.length) {
      setStatus("Heads up: more green boxes than slots, so not all can be sorted.");
    } else {
      setStatus("Select a green box to begin.");
    }
  }

  function clampWall(w: number): number {
    const n = Number.isInteger(w) ? w : 0;
    return ((n % tiling.sides) + tiling.sides) % tiling.sides;
  }

  // Random spec from the sidebar CONFIG (used by New Game).
  function generateRandomSpec(): Spec {
    const shape = CONFIG.shape;
    const t = Geometry.make(shape, CONFIG.rows, CONFIG.cols);
    const cellKeys = t.cellList.map((c) => c.key);
    const occupied = new Set<string>();
    const spec: Spec = { shape, rows: t.rows, cols: t.cols, slots: [], boxes: [], solids: [] };

    // Pick a random unoccupied cell key (works for any tiling, full rect or not).
    const pick = (): string | null => {
      let k = "", guard = 0;
      do { k = cellKeys[randInt(cellKeys.length)]; guard++; }
      while (occupied.has(k) && guard < 4000);
      if (occupied.has(k)) return null;
      occupied.add(k);
      return k;
    };
    const rc = (k: string): RC => { const [r, c] = k.split(",").map(Number); return { r, c }; };

    let guard = 0;
    // Solids first — they shape the board the boxes must navigate.
    while (spec.solids!.length < CONFIG.solids && occupied.size < cellKeys.length && guard < 9000) {
      guard++;
      const k = pick();
      if (!k) break;
      spec.solids!.push(rc(k));
    }
    guard = 0;
    while (spec.slots.length < CONFIG.slots && occupied.size < cellKeys.length && guard < 9000) {
      guard++;
      const k = pick();
      if (!k) break;
      const walls = t.validWalls(k);
      if (!walls.length) { occupied.delete(k); continue; }
      spec.slots.push({ ...rc(k), wall: walls[randInt(walls.length)] });
    }
    guard = 0;
    while (spec.boxes.length < CONFIG.boxes && occupied.size < cellKeys.length && guard < 9000) {
      guard++;
      const k = pick();
      if (!k) break;
      spec.boxes.push(rc(k));
    }
    guard = 0;
    while (spec.boxes.length < CONFIG.boxes + CONFIG.reds && occupied.size < cellKeys.length && guard < 9000) {
      guard++;
      const k = pick();
      if (!k) break;
      spec.boxes.push({ ...rc(k), red: true });
    }
    return spec;
  }

  function newGame(): void {
    buildSpec(generateRandomSpec());
  }

  // Load a saved level. Older levels stored a square "facing" instead of a wall
  // edge index — migrate those so they still play.
  function loadLevel(level: Level): void {
    const shape = level.shape || "square";
    buildSpec({
      shape,
      rows: level.rows,
      cols: level.cols,
      slots: level.slots.map((s) => ({ r: s.r, c: s.c, wall: slotWall(s, shape) })),
      boxes: level.boxes.map((b) => ({ r: b.r, c: b.c, red: !!b.red })),
      holes: (level.holes || []).map((h) => ({ r: h.r, c: h.c })),
      solids: (level.solids || []).map((s) => ({ r: s.r, c: s.c })),
    });
  }

  // Square facing→wall migration: wall is opposite the front. Edge order for
  // square is top(0), right(1), bottom(2), left(3).
  const FACING_TO_WALL: Record<string, number> = { up: 2, down: 0, left: 1, right: 3 };
  function slotWall(s: { wall?: number | null; facing?: string }, shape: string): number {
    if (Number.isInteger(s.wall)) return s.wall as number;
    if (shape === "square" && s.facing && s.facing in FACING_TO_WALL) return FACING_TO_WALL[s.facing];
    return 0;
  }

  // Draw a slot: colour its polygon and lay a thick bar along its wall edge.
  function decorateSlot(slot: Slot): void {
    const poly = slot.el;
    poly.classList.add("slot");
    const cell = tiling.get(key(slot.r, slot.c))!;
    const a = cell.corners[slot.wall];
    const b = cell.corners[(slot.wall + 1) % tiling.sides];
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "wall-line");
    boardSvg.appendChild(line);
    slot.wallLine = line;
  }

  function makeBoxEl(box: Box): HTMLElement {
    const el = document.createElement("div");
    el.className = "box";
    el.style.width = tiling.boxSize + "px";
    el.style.height = tiling.boxSize + "px";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onBoxClick(box);
    });
    return el;
  }

  // Position a box centred on its current cell.
  function positionBox(box: Box): void {
    const { cx, cy } = centerOf(box.r, box.c);
    const h = tiling.boxSize / 2;
    box.el.style.transform = `translate(${cx - h}px, ${cy - h}px)`;
  }

  // Translate string for a box centred on cell (r,c) — used in animation keyframes.
  function boxTransform(r: number, c: number): string {
    const { cx, cy } = centerOf(r, c);
    const h = tiling.boxSize / 2;
    return `translate(${cx - h}px, ${cy - h}px)`;
  }

  /* ---------- Occupancy / obstacles ---------- */

  // Cells blocked for pathfinding. Cell obstacles (invisible holes + visible
  // solids) block every box. Other static boxes block a normal box too, but a
  // red box passes through them. Moving boxes never block (they pass through).
  function blockedSet(movingBox: Box): Set<string> {
    const blocked = new Set(holes);
    for (const k of solids) blocked.add(k);
    if (!movingBox.red) {
      for (const b of boxes) {
        if (b === movingBox) continue;
        if (b.state === "moving") continue;
        blocked.add(key(b.r, b.c));
      }
    }
    return blocked;
  }

  /* ---------- Pathfinding (BFS) ---------- */

  // Find shortest path from box to (tr,tc). For normal boxes slot walls are
  // impassable edges, so a slot can only be entered from its front or sides;
  // red boxes ignore walls. Returns array of {r,c} incl. start & target, or
  // null if unreachable.
  function findPath(box: Box, tr: number, tc: number): RC[] | null {
    const blocked = blockedSet(box);
    const start = key(box.r, box.c);
    const target = key(tr, tc);

    const queue: string[] = [start];
    const prev = new Map<string, string | null>();
    prev.set(start, null);

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === target) return reconstruct(prev, target);

      for (const { key: nk } of tiling.neighbors(cur)) {
        if (prev.has(nk)) continue;
        if (blocked.has(nk)) continue;
        if (!box.red && wallEdges.has(edgeKeyK(cur, nk))) continue; // red boxes cross slot walls

        prev.set(nk, cur);
        queue.push(nk);
      }
    }
    return null;
  }

  function reconstruct(prev: Map<string, string | null>, endK: string): RC[] {
    const path: RC[] = [];
    let cur: string | null | undefined = endK;
    while (cur) {
      const [r, c] = cur.split(",").map(Number);
      path.push({ r, c });
      cur = prev.get(cur);
    }
    path.reverse();
    return path;
  }

  /* ---------- Movement / animation ---------- */

  // slot may be a slot object (final destination) or null for a neutral cell.
  function moveBoxAlong(box: Box, path: RC[], slot: Slot | null): void {
    box.state = "moving";
    box.el.classList.add("moving");
    box.el.classList.remove("selected");

    if (slot) {
      slot.reserved = true;
      slot.el.classList.add("reserved");
      box.target = slot;
    }

    // Web Animations API: trace the whole path (cell centre to cell centre).
    const keyframes = path.map((p) => ({ transform: boxTransform(p.r, p.c) }));
    const duration = Math.max(STEP_MS, (path.length - 1) * STEP_MS);

    const anim = box.el.animate(keyframes, { duration, easing: "linear", fill: "forwards" });

    anim.onfinish = () => {
      const end = path[path.length - 1];
      box.r = end.r;
      box.c = end.c;
      positionBox(box); // pin final position
      box.el.classList.remove("moving");

      if (slot) {
        box.state = "placed";
        box.el.classList.add("placed");
        slot.filled = true;
        slot.reserved = false;
        slot.el.classList.remove("reserved");
        slot.el.classList.add("filled");
      } else {
        box.state = "idle"; // parked on a neutral cell — still needs sorting
      }

      updatePlacedCount();
      checkWin();
    };
  }

  /* ---------- Interaction ---------- */

  function onBoxClick(box: Box): void {
    if (box.state === "moving") return;
    if (box.state === "placed") liftBox(box); // lift it back off its slot
    selectBox(box);
  }

  function liftBox(box: Box): void {
    if (box.target) {
      box.target.filled = false;
      box.target.el.classList.remove("filled");
      box.target = null;
    }
    box.state = "idle";
    box.el.classList.remove("placed");
  }

  function selectBox(box: Box): void {
    if (selectedBox === box) { clearSelection(); return; }
    clearSelection();
    selectedBox = box;
    box.el.classList.add("selected");
    boardEl.classList.add("selecting");
    setStatus(box.red
      ? "Red box — send it to any open cell (it slips through boxes and walls)."
      : "Pick a yellow slot — or any empty cell to reposition.");
  }

  function clearSelection(): void {
    if (selectedBox) selectedBox.el.classList.remove("selected");
    selectedBox = null;
    boardEl.classList.remove("selecting");
  }

  function onCellClick(r: number, c: number): void {
    if (!selectedBox) return;
    const box = selectedBox;

    if (solids.has(key(r, c))) return; // solid block — not a destination

    const slotCell = slots.find((s) => s.r === r && s.c === c) || null;
    // Red boxes never claim a slot — they just park on the cell.
    const slot = box.red ? null : slotCell;

    if (box.r === r && box.c === c) return; // its own cell

    const occupied = boxes.some((b) => b !== box && b.state !== "moving" && b.r === r && b.c === c);
    if (occupied) {
      setStatus("Another box is sitting there.", "error");
      showAngry(box);
      return;
    }

    if (slotCell && (slotCell.filled || slotCell.reserved)) {
      setStatus("That slot is already taken.", "error");
      showAngry(box);
      return;
    }

    const path = findPath(box, r, c);
    if (!path) {
      setStatus(
        slot ? "No clear path to that slot — it's blocked or walled off."
             : "No clear path to that cell — it's blocked.",
        "error"
      );
      showAngry(box);
      return;
    }

    clearSelection();
    moveBoxAlong(box, path, slot || null);
    setStatus(
      slot ? "Box on the move! You can send another while it travels."
           : "Box parked — reorganize, then send it to a slot.",
      "ok"
    );
  }

  /* ---------- UI helpers ---------- */

  // Pop an angry red emoji over a box to signal an impossible move.
  function showAngry(box: Box): void {
    if (!box) return;
    box.el.querySelector(".angry")?.remove(); // restart if already showing
    const bubble = document.createElement("div");
    bubble.className = "angry";
    bubble.textContent = "😡";
    box.el.appendChild(bubble);
    box.el.classList.add("shake");
    bubble.addEventListener("animationend", () => {
      bubble.remove();
      box.el.classList.remove("shake");
    });
  }

  function setStatus(msg: string, kind?: string): void {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  // Only green boxes are goals; red boxes are free-roaming and never counted.
  function goalBoxes(): Box[] { return boxes.filter((b) => !b.red); }

  function updatePlacedCount(): void {
    placedEl.textContent = String(goalBoxes().filter((b) => b.state === "placed").length);
  }

  function checkWin(): void {
    const goals = goalBoxes();
    const allPlaced = goals.length > 0 && goals.every((b) => b.state === "placed");
    if (allPlaced) {
      setStatus("All boxes sorted!", "ok");
      winEl.classList.remove("hidden");
    }
  }

  /* ---------- Sidebar config ---------- */

  const inputs = {
    rows: document.getElementById("cfg-rows") as HTMLInputElement,
    cols: document.getElementById("cfg-cols") as HTMLInputElement,
    boxes: document.getElementById("cfg-boxes") as HTMLInputElement,
    reds: document.getElementById("cfg-reds") as HTMLInputElement,
    slots: document.getElementById("cfg-slots") as HTMLInputElement,
    solids: document.getElementById("cfg-solids") as HTMLInputElement,
    shape: document.getElementById("cfg-shape") as HTMLSelectElement,
  };
  const cfgHint = document.getElementById("cfg-hint")!;

  const STORAGE_KEY = "sortingSquares.config";

  function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
  function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  function saveConfig(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG)); } catch (e) { /* ignore */ }
  }

  function loadConfig(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k of ["rows", "cols", "boxes", "reds", "slots", "solids"]) {
        if (typeof saved[k] === "number" && saved[k] >= 0) (CONFIG as any)[k] = saved[k];
      }
      if (Geometry.SHAPES.includes(saved.shape)) CONFIG.shape = saved.shape;
    } catch (e) { /* corrupt / unavailable — keep defaults */ }
  }

  // Read the sidebar, clamp to sane ranges, and sync values back into the UI.
  function readConfig(): void {
    const rows = clamp(parseInt(inputs.rows.value, 10) || CONFIG.rows, ...LIMITS.rows);
    const cols = clamp(parseInt(inputs.cols.value, 10) || CONFIG.cols, ...LIMITS.cols);
    const capacity = rows * cols;

    // Fill the board in priority order, each capped by what's left of the grid.
    let slotN = Math.max(0, parseInt(inputs.slots.value, 10) || 0);
    let boxN = Math.max(0, parseInt(inputs.boxes.value, 10) || 0);
    let redN = Math.max(0, parseInt(inputs.reds.value, 10) || 0);
    let solidN = Math.max(0, parseInt(inputs.solids.value, 10) || 0);
    let left = capacity;
    slotN = Math.min(slotN, left); left -= slotN;
    boxN = Math.min(boxN, left); left -= boxN;
    redN = Math.min(redN, left); left -= redN;
    solidN = Math.min(solidN, left); left -= solidN;

    const shape = Geometry.SHAPES.includes(inputs.shape.value) ? inputs.shape.value : "square";

    CONFIG.rows = rows; CONFIG.cols = cols;
    CONFIG.slots = slotN; CONFIG.boxes = boxN; CONFIG.reds = redN; CONFIG.solids = solidN;
    CONFIG.shape = shape;

    inputs.rows.value = String(rows);
    inputs.cols.value = String(cols);
    inputs.slots.value = String(slotN);
    inputs.boxes.value = String(boxN);
    inputs.reds.value = String(redN);
    inputs.solids.value = String(solidN);
    inputs.shape.value = shape;

    const totalBoxes = boxN + redN;
    cfgHint.textContent =
      totalBoxes > slotN
        ? "More boxes than slots — not all can be sorted."
        : `${cap(shape)} ${cols}×${rows}, ${boxN}+${redN} boxes, ${slotN} slots, ${solidN} solid.`;

    saveConfig();
  }

  function applyAndStart(): void {
    currentLevelId = null;
    picker.value = "";
    updateEditLink();
    readConfig();
    newGame();
  }

  /* ---------- Level picker ---------- */

  const picker = document.getElementById("level-picker") as HTMLSelectElement;
  const editLink = document.getElementById("edit-link") as HTMLAnchorElement;
  let currentLevelId: string | null = null; // null = random game

  function populatePicker(): void {
    const levels = Levels.list();
    picker.innerHTML = "";
    const randomOpt = document.createElement("option");
    randomOpt.value = "";
    randomOpt.textContent = "🎲 Random game";
    picker.appendChild(randomOpt);
    for (const lvl of levels) {
      const opt = document.createElement("option");
      opt.value = lvl.id || "";
      opt.textContent = lvl.name;
      picker.appendChild(opt);
    }
    picker.value = currentLevelId || "";
    updateEditLink();
  }

  // Point the Edit link at the selected level (or a blank editor for random).
  function updateEditLink(): void {
    if (currentLevelId) {
      editLink.href = "level-editor.html?edit=" + encodeURIComponent(currentLevelId);
      editLink.title = "Edit this level";
      editLink.textContent = "✎ Edit this";
    } else {
      editLink.href = "level-editor.html";
      editLink.title = "Open level editor";
      editLink.textContent = "✎ Editor";
    }
  }

  editLink.addEventListener("click", (e) => {
    e.preventDefault();
    gotoView("editor", currentLevelId ? { edit: currentLevelId } : undefined);
  });

  // Start whatever the picker currently points at (custom level or random).
  function startSelected(): void {
    if (currentLevelId) {
      const lvl = Levels.get(currentLevelId);
      if (lvl) { loadLevel(lvl); return; }
      currentLevelId = null; // vanished — fall back to random
      picker.value = "";
    }
    newGame();
  }

  picker.addEventListener("change", () => {
    currentLevelId = picker.value || null;
    updateEditLink();
    startSelected();
  });

  /* ---------- Boot ---------- */

  loadConfig();

  inputs.rows.value = String(CONFIG.rows);
  inputs.cols.value = String(CONFIG.cols);
  inputs.boxes.value = String(CONFIG.boxes);
  inputs.reds.value = String(CONFIG.reds);
  inputs.slots.value = String(CONFIG.slots);
  inputs.solids.value = String(CONFIG.solids);
  inputs.shape.value = CONFIG.shape;

  document.getElementById("applyCfg")!.addEventListener("click", applyAndStart);
  document.getElementById("newGame")!.addEventListener("click", startSelected);
  document.getElementById("winNew")!.addEventListener("click", startSelected);

  document.getElementById("closeSidebar")!.addEventListener("click", () =>
    document.body.classList.add("sidebar-collapsed")
  );
  document.getElementById("openSidebar")!.addEventListener("click", () =>
    document.body.classList.remove("sidebar-collapsed")
  );

  readConfig();

  // Deep link: ?level=<id> (or #play?level=<id>) auto-loads that saved level.
  const urlLevel = routeParams().get("level");
  if (urlLevel && Levels.get(urlLevel)) currentLevelId = urlLevel;

  populatePicker();
  startSelected();

  // If a levels file was linked in the editor and the browser still grants
  // access silently, pull it so the picker reflects it (else use the cache).
  if (Levels.fs && Levels.fs.supported) {
    Levels.fs.reconnect().then((st) => {
      if (st && st.ready) populatePicker();
    }).catch(() => { /* ignore — cached levels remain */ });
  }
})();
