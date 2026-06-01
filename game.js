/* Sorting Squares
 * Move every green box onto a yellow slot. A slot has a dark wall on its
 * "back" side and can only be entered from the front or the two laterals.
 * Boxes find a path through empty cells; static boxes block the way, but
 * boxes that are currently moving do not (they simply pass through).
 */

const STEP_MS = 130; // animation time per cell stepped
const SVG_NS = "http://www.w3.org/2000/svg";

// Grid dimensions / shape — set by newGame() from the sidebar config.
let ROWS = 10;
let COLS = 10;
let SHAPE = "square";
let tiling = null;   // current Geometry tiling

// Defaults / limits for the sidebar controls.
const CONFIG = { rows: 10, cols: 10, boxes: 6, slots: 6, shape: "square" };
const LIMITS = { rows: [2, 16], cols: [2, 16] };

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const placedEl = document.getElementById("placed");
const totalEl = document.getElementById("total");
const winEl = document.getElementById("win");

let cellEls = new Map(); // key -> <polygon>
let slots = [];          // { r, c, wall, filled, reserved, el }
let boxes = [];          // { id, r, c, state, target, el }
let selectedBox = null;
let wallEdges = new Set(); // impassable edges between a slot and the cell behind its wall
let holes = new Set();     // invisible cells: not drawn, impassable (permanent obstacles)

function key(r, c) { return r + "," + c; }
function cellExists(r, c) { return tiling.has(key(r, c)); }
function centerOf(r, c) { const cell = tiling.get(key(r, c)); return { cx: cell.cx, cy: cell.cy }; }

// Undirected edge between two cells, by their string keys; order-independent.
function edgeKeyK(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

/* ---------- Board construction (SVG) ---------- */

function buildBoard() {
  boardEl.innerHTML = "";
  boardEl.style.width = tiling.width + "px";
  boardEl.style.height = tiling.height + "px";
  cellEls = new Map();

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", tiling.width);
  svg.setAttribute("height", tiling.height);
  svg.setAttribute("viewBox", `0 0 ${tiling.width} ${tiling.height}`);
  svg.classList.add("board-svg");

  for (const cell of tiling.cellList) {
    if (holes.has(cell.key)) continue; // invisible cell — not drawn
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", cell.corners.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("class", "cell" + ((cell.r + cell.c) % 2 ? " alt" : ""));
    poly.dataset.key = cell.key;
    poly.addEventListener("click", () => onCellClick(cell.r, cell.c));
    svg.appendChild(poly);
    cellEls.set(cell.key, poly);
  }
  boardEl.appendChild(svg);
  boardEl._svg = svg;
}

/* ---------- Level generation ---------- */

function randInt(n) { return Math.floor(Math.random() * n); }

function pickRandomEmpty(occupied) {
  let r, c, k, guard = 0;
  do {
    r = randInt(ROWS);
    c = randInt(COLS);
    k = key(r, c);
    guard++;
  } while (occupied.has(k) && guard < 1000);
  occupied.add(k);
  return { r, c };
}

// Add one slot (with its wall edge) from a {r,c,wall} spec.
function addSlot(r, c, wall) {
  const slot = { r, c, wall, filled: false, reserved: false, el: cellEls.get(key(r, c)) };
  slots.push(slot);
  decorateSlot(slot);
  // The wall blocks the edge between the slot and the cell across that edge.
  const nk = tiling.neighborAcross(key(r, c), wall);
  if (nk) wallEdges.add(edgeKeyK(key(r, c), nk));
  return slot;
}

// Add one green box at (r,c).
function addBox(r, c) {
  const box = { id: boxes.length, r, c, state: "idle", target: null, el: null };
  box.el = makeBoxEl(box);
  boardEl.appendChild(box.el);
  positionBox(box);
  boxes.push(box);
  return box;
}

// Build the board from a spec: { shape, rows, cols, slots:[{r,c,wall}], boxes:[{r,c}] }.
function buildSpec(spec) {
  SHAPE = Geometry.SHAPES.includes(spec.shape) ? spec.shape : "square";
  tiling = Geometry.make(SHAPE, spec.rows, spec.cols);
  ROWS = tiling.rows; // pentagon rounds up to even
  COLS = tiling.cols;

  // Invisible cells — not drawn, and permanent obstacles for pathfinding.
  holes = new Set();
  for (const h of spec.holes || []) {
    if (cellExists(h.r, h.c)) holes.add(key(h.r, h.c));
  }

  buildBoard();
  slots = [];
  boxes = [];
  wallEdges = new Set();
  selectedBox = null;
  winEl.classList.add("hidden");

  for (const s of spec.slots) {
    if (cellExists(s.r, s.c) && !holes.has(key(s.r, s.c))) addSlot(s.r, s.c, clampWall(s.wall));
  }
  for (const b of spec.boxes) {
    if (cellExists(b.r, b.c) && !holes.has(key(b.r, b.c))) addBox(b.r, b.c);
  }

  totalEl.textContent = boxes.length;
  updatePlacedCount();

  if (boxes.length === 0 || slots.length === 0) {
    setStatus("This level has no boxes or no slots.");
  } else if (boxes.length > slots.length) {
    setStatus("Heads up: more boxes than slots, so not all can be sorted.");
  } else {
    setStatus("Select a green box to begin.");
  }
}

function clampWall(w) {
  const n = Number.isInteger(w) ? w : 0;
  return ((n % tiling.sides) + tiling.sides) % tiling.sides;
}

// Random spec from the sidebar CONFIG (used by New Game).
function generateRandomSpec() {
  const shape = CONFIG.shape;
  const t = Geometry.make(shape, CONFIG.rows, CONFIG.cols);
  const cellKeys = t.cellList.map((c) => c.key);
  const occupied = new Set();
  const spec = { shape, rows: t.rows, cols: t.cols, slots: [], boxes: [] };

  // Pick a random unoccupied cell key (works for any tiling, full rect or not).
  const pick = () => {
    let k, guard = 0;
    do { k = cellKeys[randInt(cellKeys.length)]; guard++; }
    while (occupied.has(k) && guard < 4000);
    if (occupied.has(k)) return null;
    occupied.add(k);
    return k;
  };
  const rc = (k) => { const [r, c] = k.split(",").map(Number); return { r, c }; };

  let guard = 0;
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
  return spec;
}

function newGame() {
  buildSpec(generateRandomSpec());
}

// Load a saved level. Older levels stored a square "facing" instead of a wall
// edge index — migrate those so they still play.
function loadLevel(level) {
  const shape = level.shape || "square";
  buildSpec({
    shape,
    rows: level.rows,
    cols: level.cols,
    slots: level.slots.map((s) => ({ r: s.r, c: s.c, wall: slotWall(s, shape) })),
    boxes: level.boxes.map((b) => ({ r: b.r, c: b.c })),
    holes: (level.holes || []).map((h) => ({ r: h.r, c: h.c })),
  });
}

// Square facing→wall migration: wall is opposite the front. Edge order for
// square is top(0), right(1), bottom(2), left(3).
const FACING_TO_WALL = { up: 2, down: 0, left: 1, right: 3 };
function slotWall(s, shape) {
  if (Number.isInteger(s.wall)) return s.wall;
  if (shape === "square" && s.facing in FACING_TO_WALL) return FACING_TO_WALL[s.facing];
  return 0;
}

// Draw a slot: colour its polygon and lay a thick bar along its wall edge.
function decorateSlot(slot) {
  const poly = slot.el;
  poly.classList.add("slot");
  const cell = tiling.get(key(slot.r, slot.c));
  const a = cell.corners[slot.wall];
  const b = cell.corners[(slot.wall + 1) % tiling.sides];
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
  line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  line.setAttribute("class", "wall-line");
  boardEl._svg.appendChild(line);
  slot.wallLine = line;
}

function makeBoxEl(box) {
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
function positionBox(box) {
  const { cx, cy } = centerOf(box.r, box.c);
  const h = tiling.boxSize / 2;
  box.el.style.transform = `translate(${cx - h}px, ${cy - h}px)`;
}

// Translate string for a box centred on cell (r,c) — used in animation keyframes.
function boxTransform(r, c) {
  const { cx, cy } = centerOf(r, c);
  const h = tiling.boxSize / 2;
  return `translate(${cx - h}px, ${cy - h}px)`;
}

/* ---------- Occupancy / obstacles ---------- */

// Cells blocked for pathfinding: invisible cells (always), plus any box that is
// NOT moving and NOT the one we are routing. Moving boxes pass through.
function blockedSet(movingBox) {
  const blocked = new Set(holes);
  for (const b of boxes) {
    if (b === movingBox) continue;
    if (b.state === "moving") continue;
    blocked.add(key(b.r, b.c));
  }
  return blocked;
}

/* ---------- Pathfinding (BFS) ---------- */

// Find shortest path from box to (tr,tc). Slot walls are impassable edges
// (see wallEdges), so the box can never cross a black bar — which also means
// a slot can only be entered from its front or sides. Returns array of {r,c}
// incl. start & target, or null if unreachable.
function findPath(box, tr, tc) {
  const blocked = blockedSet(box);
  const start = key(box.r, box.c);
  const target = key(tr, tc);

  const queue = [start];
  const prev = new Map();
  prev.set(start, null);

  while (queue.length) {
    const cur = queue.shift();
    if (cur === target) return reconstruct(prev, target);

    for (const { key: nk } of tiling.neighbors(cur)) {
      if (prev.has(nk)) continue;
      if (blocked.has(nk)) continue;
      // Can't cross a wall (the dark bar on a slot's edge).
      if (wallEdges.has(edgeKeyK(cur, nk))) continue;

      prev.set(nk, cur);
      queue.push(nk);
    }
  }
  return null;
}

function reconstruct(prev, endK) {
  const path = [];
  let cur = endK;
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
function moveBoxAlong(box, path, slot) {
  box.state = "moving";
  box.el.classList.add("moving");
  box.el.classList.remove("selected");

  // Reserve the target slot so other boxes can't be sent to it.
  if (slot) {
    slot.reserved = true;
    slot.el.classList.add("reserved");
    box.target = slot;
  }

  // Build keyframes for the Web Animations API so the box smoothly traces
  // the whole path (cell centre to cell centre) in one go.
  const keyframes = path.map((p) => ({ transform: boxTransform(p.r, p.c) }));
  const duration = Math.max(STEP_MS, (path.length - 1) * STEP_MS);

  const anim = box.el.animate(keyframes, {
    duration,
    easing: "linear",
    fill: "forwards",
  });

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
      // Parked on a neutral cell — still needs to be sorted.
      box.state = "idle";
    }

    updatePlacedCount();
    checkWin();
  };
}

/* ---------- Interaction ---------- */

function onBoxClick(box) {
  if (box.state === "moving") return;

  // If this box is already placed, lift it back off its slot so it can move.
  if (box.state === "placed") {
    liftBox(box);
  }

  selectBox(box);
}

function liftBox(box) {
  if (box.target) {
    box.target.filled = false;
    box.target.el.classList.remove("filled");
    box.target = null;
  }
  box.state = "idle";
  box.el.classList.remove("placed");
}

function selectBox(box) {
  if (selectedBox === box) { clearSelection(); return; }
  clearSelection();
  selectedBox = box;
  box.el.classList.add("selected");
  boardEl.classList.add("selecting");
  setStatus("Pick a yellow slot — or any empty cell to reposition.");
}

function clearSelection() {
  if (selectedBox) selectedBox.el.classList.remove("selected");
  selectedBox = null;
  boardEl.classList.remove("selecting");
}

function onCellClick(r, c) {
  if (!selectedBox) return;

  const slot = slots.find((s) => s.r === r && s.c === c);

  // Clicking on the box's own cell does nothing useful.
  if (selectedBox.r === r && selectedBox.c === c) return;

  // A static box (idle/placed) already sits here — can't stack.
  const occupied = boxes.some(
    (b) => b !== selectedBox && b.state !== "moving" && b.r === r && b.c === c
  );
  if (occupied) {
    setStatus("Another box is sitting there.", "error");
    showAngry(selectedBox);
    return;
  }

  if (slot && (slot.filled || slot.reserved)) {
    setStatus("That slot is already taken.", "error");
    showAngry(selectedBox);
    return;
  }

  // Walls are impassable edges, so the front/lateral rule is enforced globally.
  const path = findPath(selectedBox, r, c);
  if (!path) {
    setStatus(
      slot
        ? "No clear path to that slot — it's blocked or walled off."
        : "No clear path to that cell — it's blocked.",
      "error"
    );
    showAngry(selectedBox);
    return;
  }

  const box = selectedBox;
  clearSelection();
  moveBoxAlong(box, path, slot || null);
  setStatus(
    slot
      ? "Box on the move! You can send another while it travels."
      : "Box parked — reorganize, then send it to a slot.",
    "ok"
  );
}

/* ---------- UI helpers ---------- */

// Pop an angry red emoji over a box to signal an impossible move.
function showAngry(box) {
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

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function updatePlacedCount() {
  placedEl.textContent = boxes.filter((b) => b.state === "placed").length;
}

function checkWin() {
  const allPlaced = boxes.length > 0 && boxes.every((b) => b.state === "placed");
  if (allPlaced) {
    setStatus("All boxes sorted!", "ok");
    winEl.classList.remove("hidden");
  }
}

/* ---------- Sidebar config ---------- */

const inputs = {
  rows: document.getElementById("cfg-rows"),
  cols: document.getElementById("cfg-cols"),
  boxes: document.getElementById("cfg-boxes"),
  slots: document.getElementById("cfg-slots"),
  shape: document.getElementById("cfg-shape"),
};
const cfgHint = document.getElementById("cfg-hint");

const STORAGE_KEY = "sortingSquares.config";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Persist the current config so it survives refresh / New Game.
function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
  } catch (e) { /* storage unavailable — ignore */ }
}

// Load a previously saved config into CONFIG (called before inputs init).
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const k of ["rows", "cols", "boxes", "slots"]) {
      if (typeof saved[k] === "number" && saved[k] >= 0) CONFIG[k] = saved[k];
    }
    if (Geometry.SHAPES.includes(saved.shape)) CONFIG.shape = saved.shape;
  } catch (e) { /* corrupt / unavailable — keep defaults */ }
}

// Read the sidebar, clamp to sane ranges, and sync values back into the UI.
function readConfig() {
  const rows = clamp(parseInt(inputs.rows.value, 10) || CONFIG.rows, ...LIMITS.rows);
  const cols = clamp(parseInt(inputs.cols.value, 10) || CONFIG.cols, ...LIMITS.cols);
  const capacity = rows * cols;

  let slots = Math.max(0, parseInt(inputs.slots.value, 10) || 0);
  let boxes = Math.max(0, parseInt(inputs.boxes.value, 10) || 0);

  // Boxes + slots must physically fit on the grid (they occupy distinct cells).
  slots = Math.min(slots, capacity);
  boxes = Math.min(boxes, capacity - slots);

  const shape = Geometry.SHAPES.includes(inputs.shape.value) ? inputs.shape.value : "square";

  CONFIG.rows = rows;
  CONFIG.cols = cols;
  CONFIG.slots = slots;
  CONFIG.boxes = boxes;
  CONFIG.shape = shape;

  // Reflect any clamping back to the inputs.
  inputs.rows.value = rows;
  inputs.cols.value = cols;
  inputs.slots.value = slots;
  inputs.boxes.value = boxes;
  inputs.shape.value = shape;

  cfgHint.textContent =
    boxes > slots
      ? "More boxes than slots — not all can be sorted."
      : `${cap(shape)} ${cols}×${rows}, ${boxes} boxes, ${slots} slots.`;

  saveConfig();
}

// Apply the random-game options (also switches off any selected custom level).
function applyAndStart() {
  currentLevelId = null;
  picker.value = "";
  updateEditLink();
  readConfig();
  newGame();
}

/* ---------- Level picker ---------- */

const picker = document.getElementById("level-picker");
const editLink = document.getElementById("edit-link");
let currentLevelId = null; // null = random game

function populatePicker() {
  const levels = Levels.list();
  picker.innerHTML = "";
  const randomOpt = document.createElement("option");
  randomOpt.value = "";
  randomOpt.textContent = "🎲 Random game";
  picker.appendChild(randomOpt);
  for (const lvl of levels) {
    const opt = document.createElement("option");
    opt.value = lvl.id;
    opt.textContent = lvl.name;
    picker.appendChild(opt);
  }
  picker.value = currentLevelId || "";
  updateEditLink();
}

// Point the Edit link at the selected level (or a blank editor for random).
function updateEditLink() {
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
function startSelected() {
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

// Restore any saved config before populating the inputs.
loadConfig();

// Initialise inputs from defaults.
inputs.rows.value = CONFIG.rows;
inputs.cols.value = CONFIG.cols;
inputs.boxes.value = CONFIG.boxes;
inputs.slots.value = CONFIG.slots;
inputs.shape.value = CONFIG.shape;

document.getElementById("applyCfg").addEventListener("click", applyAndStart);
document.getElementById("newGame").addEventListener("click", startSelected);
document.getElementById("winNew").addEventListener("click", startSelected);

// Sidebar show/hide
document.getElementById("closeSidebar").addEventListener("click", () =>
  document.body.classList.add("sidebar-collapsed")
);
document.getElementById("openSidebar").addEventListener("click", () =>
  document.body.classList.remove("sidebar-collapsed")
);

readConfig();

// Deep link: ?level=<id> (or #play?level=<id>) auto-loads that saved level.
const urlLevel = routeParams().get("level");
if (urlLevel && Levels.get(urlLevel)) currentLevelId = urlLevel;

populatePicker();
startSelected();
