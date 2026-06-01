/* Level editor. Builds an editable tiling (square or hexagon), lets you place
 * boxes and slots (clicking a slot rotates which edge is walled), and saves
 * levels via the shared Levels module. Cells render as SVG polygons. */

const SVG_NS = "http://www.w3.org/2000/svg";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("ed-status");
const listEl = document.getElementById("ed-list");
const nameInput = document.getElementById("ed-name");
const rowsInput = document.getElementById("ed-rows");
const colsInput = document.getElementById("ed-cols");
const shapeInput = document.getElementById("ed-shape");
const boxCountEl = document.getElementById("ed-box-count");
const slotCountEl = document.getElementById("ed-slot-count");

let rows = 8, cols = 8, shape = "square";
let tiling = null;
let model = [];          // model[r][c] = null | "box" | <integer wall index = slot>
let polyEls = new Map(); // key -> <polygon>
let tool = "box";
let currentId = null;    // id of the level being edited (null = new/unsaved)

function key(r, c) { return r + "," + c; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function isSlot(v) { return Number.isInteger(v); }
function emptyModel(r, c) {
  return Array.from({ length: r }, () => Array.from({ length: c }, () => null));
}

/* ---------- Grid (SVG) ---------- */

function buildGrid() {
  tiling = Geometry.make(shape, rows, cols);
  // Pentagon rounds rows/cols up to even — sync the model to match.
  if (tiling.rows !== rows || tiling.cols !== cols) {
    const next = emptyModel(tiling.rows, tiling.cols);
    for (let r = 0; r < Math.min(rows, tiling.rows); r++)
      for (let c = 0; c < Math.min(cols, tiling.cols); c++) next[r][c] = model[r][c];
    rows = tiling.rows; cols = tiling.cols; model = next;
    rowsInput.value = rows; colsInput.value = cols;
  }
  boardEl.innerHTML = "";
  boardEl.style.width = tiling.width + "px";
  boardEl.style.height = tiling.height + "px";
  polyEls = new Map();

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", tiling.width);
  svg.setAttribute("height", tiling.height);
  svg.setAttribute("viewBox", `0 0 ${tiling.width} ${tiling.height}`);
  svg.classList.add("board-svg");
  boardEl.appendChild(svg);
  boardEl._svg = svg;

  for (const cell of tiling.cellList) {
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", cell.corners.map((p) => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("class", "cell" + ((cell.r + cell.c) % 2 ? " alt" : ""));
    poly.addEventListener("click", () => onCellClick(cell.r, cell.c));
    svg.appendChild(poly);
    polyEls.set(cell.key, poly);
  }
  // Render all current pieces.
  for (const cell of tiling.cellList) renderCell(cell.r, cell.c);
  updateCounts();
}

function renderCell(r, c) {
  const cell = tiling.get(key(r, c));
  const poly = polyEls.get(key(r, c));
  const v = model[r][c];

  // reset
  poly.setAttribute("class", "cell" + ((r + c) % 2 ? " alt" : ""));
  if (cell._wallLine) { cell._wallLine.remove(); cell._wallLine = null; }
  if (cell._boxEl) { cell._boxEl.remove(); cell._boxEl = null; }

  if (v === "hole") {
    // Invisible in-game; shown hatched in the editor so it can be placed/seen.
    poly.classList.add("hole");
  } else if (v === "box") {
    const b = document.createElement("div");
    b.className = "ed-box";
    const s = tiling.boxSize, h = s / 2;
    b.style.width = s + "px";
    b.style.height = s + "px";
    b.style.transform = `translate(${cell.cx - h}px, ${cell.cy - h}px)`;
    boardEl.appendChild(b);
    cell._boxEl = b;
  } else if (isSlot(v)) {
    poly.classList.add("slot");
    const a = cell.corners[v];
    const d = cell.corners[(v + 1) % tiling.sides];
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", d.x); line.setAttribute("y2", d.y);
    line.setAttribute("class", "wall-line");
    boardEl._svg.appendChild(line);
    cell._wallLine = line;
  }
}

function onCellClick(r, c) {
  const v = model[r][c];
  if (tool === "erase") {
    model[r][c] = null;
  } else if (tool === "hole") {
    model[r][c] = v === "hole" ? null : "hole";
  } else if (tool === "box") {
    model[r][c] = v === "box" ? null : "box";
  } else if (tool === "slot") {
    if (isSlot(v)) {
      model[r][c] = (v + 1) % tiling.sides; // rotate the walled edge
    } else {
      const walls = tiling.validWalls(key(r, c));
      model[r][c] = walls.length ? walls[0] : 0;
    }
  }
  renderCell(r, c);
  updateCounts();
}

function updateCounts() {
  let b = 0, s = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (model[r][c] === "box") b++;
      else if (isSlot(model[r][c])) s++;
    }
  boxCountEl.textContent = b;
  slotCountEl.textContent = s;
}

/* ---------- Size / shape ---------- */

function applySize() {
  const nr = clamp(parseInt(rowsInput.value, 10) || rows, Levels.SIZE_MIN, Levels.SIZE_MAX);
  const nc = clamp(parseInt(colsInput.value, 10) || cols, Levels.SIZE_MIN, Levels.SIZE_MAX);
  const ns = Geometry.SHAPES.includes(shapeInput.value) ? shapeInput.value : shape;
  const next = emptyModel(nr, nc);
  for (let r = 0; r < Math.min(rows, nr); r++)
    for (let c = 0; c < Math.min(cols, nc); c++) {
      // Drop slot walls that no longer exist if shape changed (fewer sides).
      let v = model[r][c];
      if (isSlot(v) && v >= Levels.SIDES[ns]) v = 0;
      next[r][c] = v;
    }
  rows = nr; cols = nc; shape = ns; model = next;
  rowsInput.value = rows; colsInput.value = cols; shapeInput.value = shape;
  buildGrid();
}

/* ---------- Level <-> model ---------- */

function collectLevel() {
  const slots = [], boxes = [], holes = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = model[r][c];
      if (v === "box") boxes.push({ r, c });
      else if (v === "hole") holes.push({ r, c });
      else if (isSlot(v)) slots.push({ r, c, wall: v });
    }
  return { id: currentId, name: nameInput.value.trim() || "Untitled", shape, rows, cols, slots, boxes, holes };
}

function loadIntoEditor(level) {
  shape = Geometry.SHAPES.includes(level.shape) ? level.shape : "square";
  rows = level.rows; cols = level.cols;
  model = emptyModel(rows, cols);
  for (const s of level.slots) {
    const w = Number.isInteger(s.wall) ? s.wall : 0;
    model[s.r][s.c] = ((w % Levels.SIDES[shape]) + Levels.SIDES[shape]) % Levels.SIDES[shape];
  }
  for (const b of level.boxes) model[b.r][b.c] = "box";
  for (const hgt of (level.holes || [])) model[hgt.r][hgt.c] = "hole";
  currentId = level.id;
  nameInput.value = level.name || "";
  rowsInput.value = rows; colsInput.value = cols; shapeInput.value = shape;
  buildGrid();
  setStatus(`Loaded "${level.name}". Editing — Save to update it.`, "ok");
}

/* ---------- Actions ---------- */

function saveCurrent() {
  const level = collectLevel();
  const check = Levels.validate(level);
  if (!check.ok) { setStatus("Can't save: " + check.error, "error"); return; }
  if (level.slots.length === 0 || level.boxes.length === 0) {
    setStatus("Add at least one box and one slot before saving.", "error");
    return;
  }
  currentId = Levels.save(level); // assigns id on first save
  refreshList();
  setStatus(`Saved "${level.name}".`, "ok");
}

function newLevel() {
  currentId = null;
  nameInput.value = "";
  model = emptyModel(rows, cols);
  buildGrid();
  setStatus("New blank level.", "ok");
}

function clearBoard() {
  model = emptyModel(rows, cols);
  buildGrid();
  setStatus("Board cleared.");
}

function exportCurrent() {
  const level = collectLevel();
  const check = Levels.validate(level);
  if (!check.ok) { setStatus("Can't export: " + check.error, "error"); return; }
  Levels.exportLevel(level);
}

function refreshList() {
  const levels = Levels.list();
  listEl.innerHTML = "";
  if (!levels.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No saved levels yet.";
    listEl.appendChild(li);
    return;
  }
  for (const lvl of levels) {
    const li = document.createElement("li");
    if (lvl.id === currentId) li.classList.add("editing");

    const title = document.createElement("div");
    title.className = "lvl-title";
    title.textContent = lvl.name;
    const meta = document.createElement("div");
    meta.className = "lvl-meta";
    meta.textContent = `${(lvl.shape || "square")} · ${lvl.cols}×${lvl.rows} · ${lvl.boxes.length} box · ${lvl.slots.length} slot`;

    const actions = document.createElement("div");
    actions.className = "lvl-actions";
    actions.append(
      btn("Edit", () => loadIntoEditor(lvl)),
      btn("Play", () => gotoView("play", { level: lvl.id })),
      btn("Export", () => Levels.exportLevel(lvl)),
      btn("Delete", () => {
        Levels.remove(lvl.id);
        if (currentId === lvl.id) currentId = null;
        refreshList();
      }, "danger")
    );

    li.append(title, meta, actions);
    listEl.appendChild(li);
  }
}

function btn(label, fn, cls) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = "mini" + (cls ? " " + cls : "");
  b.addEventListener("click", fn);
  return b;
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "ed-status" + (kind ? " " + kind : "");
}

/* ---------- Wiring ---------- */

function selectTool(t) {
  tool = t;
  for (const b of document.querySelectorAll("#ed-tools .tool"))
    b.classList.toggle("active", b.dataset.tool === t);
}

document.getElementById("ed-tools").addEventListener("click", (e) => {
  const b = e.target.closest(".tool");
  if (b) selectTool(b.dataset.tool);
});
document.getElementById("ed-apply-size").addEventListener("click", applySize);
document.getElementById("ed-save").addEventListener("click", saveCurrent);
document.getElementById("ed-new").addEventListener("click", newLevel);
document.getElementById("ed-clear").addEventListener("click", clearBoard);
document.getElementById("ed-export").addEventListener("click", exportCurrent);
document.getElementById("ed-export-all").addEventListener("click", () => Levels.exportAll());
document.getElementById("ed-import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const res = Levels.importJSON(String(reader.result));
    if (res.error) setStatus("Import failed: " + res.error, "error");
    else setStatus(`Imported ${res.added} level(s)${res.skipped ? `, skipped ${res.skipped}` : ""}.`, "ok");
    refreshList();
  };
  reader.readAsText(file);
  e.target.value = ""; // allow re-importing the same file
});

// "▶ Play" link → switch to the play view.
document.getElementById("play-link").addEventListener("click", (e) => {
  e.preventDefault();
  gotoView("play");
});

/* ---------- Boot ---------- */

rowsInput.value = rows;
colsInput.value = cols;
shapeInput.value = shape;
model = emptyModel(rows, cols);
selectTool("box");
buildGrid();
refreshList();

// If arriving with ?edit=<id> (or #editor?edit=<id>), open that level.
const editId = routeParams().get("edit");
if (editId) {
  const lvl = Levels.get(editId);
  if (lvl) loadIntoEditor(lvl);
}
