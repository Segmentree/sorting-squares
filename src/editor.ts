/* Level editor. Builds an editable tiling (square / pentagon / hexagon), lets
 * you place boxes, slots (clicking a slot rotates the walled edge) and holes,
 * and saves levels via the shared Levels module. Cells render as SVG polygons.
 *
 * Wrapped in an IIFE so its top-level names don't collide with game.ts in the
 * shared (non-module) global scope.
 */
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // A cell's editor state: empty, a green box, a red box (passes through other
  // boxes), an invisible hole, a visible solid block, or a slot (the number is
  // its walled edge index).
  type CellVal = null | "box" | "red" | "hole" | "solid" | number;

  const boardEl = document.getElementById("board")!;
  const statusEl = document.getElementById("ed-status")!;
  const listEl = document.getElementById("ed-list")!;
  const nameInput = document.getElementById("ed-name") as HTMLInputElement;
  const rowsInput = document.getElementById("ed-rows") as HTMLInputElement;
  const colsInput = document.getElementById("ed-cols") as HTMLInputElement;
  const shapeInput = document.getElementById("ed-shape") as HTMLSelectElement;
  const boxCountEl = document.getElementById("ed-box-count")!;
  const slotCountEl = document.getElementById("ed-slot-count")!;

  let rows = 8, cols = 8, shape = "square";
  let tiling: Tiling = null as unknown as Tiling;
  let model: CellVal[][] = [];
  let polyEls = new Map<string, SVGPolygonElement>();
  let boardSvg: SVGSVGElement;
  let tool = "box";
  let currentId: string | null = null; // id of the level being edited (null = new/unsaved)

  function key(r: number, c: number): string { return r + "," + c; }
  function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
  function isSlot(v: CellVal): v is number { return typeof v === "number"; }
  function emptyModel(r: number, c: number): CellVal[][] {
    return Array.from({ length: r }, () => Array.from({ length: c }, () => null as CellVal));
  }

  /* ---------- Grid (SVG) ---------- */

  function buildGrid(): void {
    tiling = Geometry.make(shape, rows, cols);
    // Pentagon rounds rows/cols up to even — sync the model to match.
    if (tiling.rows !== rows || tiling.cols !== cols) {
      const next = emptyModel(tiling.rows, tiling.cols);
      for (let r = 0; r < Math.min(rows, tiling.rows); r++)
        for (let c = 0; c < Math.min(cols, tiling.cols); c++) next[r][c] = model[r][c];
      rows = tiling.rows; cols = tiling.cols; model = next;
      rowsInput.value = String(rows); colsInput.value = String(cols);
    }
    boardEl.innerHTML = "";
    boardEl.style.width = tiling.width + "px";
    boardEl.style.height = tiling.height + "px";
    polyEls = new Map();

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(tiling.width));
    svg.setAttribute("height", String(tiling.height));
    svg.setAttribute("viewBox", `0 0 ${tiling.width} ${tiling.height}`);
    svg.classList.add("board-svg");
    boardEl.appendChild(svg);
    boardSvg = svg;

    for (const cell of tiling.cellList) {
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", cell.corners.map((p) => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("class", "cell" + ((cell.r + cell.c) % 2 ? " alt" : ""));
      poly.addEventListener("click", () => onCellClick(cell.r, cell.c));
      svg.appendChild(poly);
      polyEls.set(cell.key, poly);
    }
    for (const cell of tiling.cellList) renderCell(cell.r, cell.c);
    updateCounts();
  }

  function renderCell(r: number, c: number): void {
    const cell = tiling.get(key(r, c))!;
    const poly = polyEls.get(key(r, c))!;
    const v = model[r][c];

    poly.setAttribute("class", "cell" + ((r + c) % 2 ? " alt" : ""));
    if (cell._wallLine) { cell._wallLine.remove(); cell._wallLine = null; }
    if (cell._boxEl) { cell._boxEl.remove(); cell._boxEl = null; }

    if (v === "hole") {
      poly.classList.add("hole"); // invisible in-game; hatched here
    } else if (v === "solid") {
      poly.classList.add("solid"); // visible, impassable for every box
    } else if (v === "box" || v === "red") {
      const b = document.createElement("div");
      b.className = "ed-box" + (v === "red" ? " red" : "");
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
      line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(d.x)); line.setAttribute("y2", String(d.y));
      line.setAttribute("class", "wall-line");
      boardSvg.appendChild(line);
      cell._wallLine = line;
    }
  }

  function onCellClick(r: number, c: number): void {
    const v = model[r][c];
    if (tool === "erase") {
      model[r][c] = null;
    } else if (tool === "hole") {
      model[r][c] = v === "hole" ? null : "hole";
    } else if (tool === "solid") {
      model[r][c] = v === "solid" ? null : "solid";
    } else if (tool === "box") {
      model[r][c] = v === "box" ? null : "box";
    } else if (tool === "red") {
      model[r][c] = v === "red" ? null : "red";
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

  function updateCounts(): void {
    let b = 0, s = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = model[r][c];
        if (v === "box" || v === "red") b++;
        else if (isSlot(v)) s++;
      }
    boxCountEl.textContent = String(b);
    slotCountEl.textContent = String(s);
  }

  /* ---------- Size / shape ---------- */

  function applySize(): void {
    const nr = clamp(parseInt(rowsInput.value, 10) || rows, Levels.SIZE_MIN, Levels.SIZE_MAX);
    const nc = clamp(parseInt(colsInput.value, 10) || cols, Levels.SIZE_MIN, Levels.SIZE_MAX);
    const ns = Geometry.SHAPES.includes(shapeInput.value) ? shapeInput.value : shape;
    const next = emptyModel(nr, nc);
    for (let r = 0; r < Math.min(rows, nr); r++)
      for (let c = 0; c < Math.min(cols, nc); c++) {
        // Drop slot walls that no longer exist if the shape changed (fewer sides).
        let v = model[r][c];
        if (isSlot(v) && v >= Levels.SIDES[ns]) v = 0;
        next[r][c] = v;
      }
    rows = nr; cols = nc; shape = ns; model = next;
    rowsInput.value = String(rows); colsInput.value = String(cols); shapeInput.value = shape;
    buildGrid();
  }

  /* ---------- Level <-> model ---------- */

  function collectLevel(): Level {
    const slots: Level["slots"] = [], boxes: Level["boxes"] = [];
    const holes: Level["holes"] = [], solids: Level["solids"] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = model[r][c];
        if (v === "box") boxes.push({ r, c });
        else if (v === "red") boxes.push({ r, c, red: true });
        else if (v === "hole") holes.push({ r, c });
        else if (v === "solid") solids.push({ r, c });
        else if (isSlot(v)) slots.push({ r, c, wall: v });
      }
    return {
      id: currentId, name: nameInput.value.trim() || "Untitled", shape, rows, cols,
      slots, boxes, holes, solids, updatedAt: 0,
    };
  }

  function loadIntoEditor(level: Level): void {
    shape = Geometry.SHAPES.includes(level.shape) ? level.shape : "square";
    rows = level.rows; cols = level.cols;
    model = emptyModel(rows, cols);
    const sides = Levels.SIDES[shape];
    for (const s of level.slots) {
      const w = Number.isInteger(s.wall) ? (s.wall as number) : 0;
      model[s.r][s.c] = ((w % sides) + sides) % sides;
    }
    for (const b of level.boxes) model[b.r][b.c] = b.red ? "red" : "box";
    for (const h of (level.holes || [])) model[h.r][h.c] = "hole";
    for (const s of (level.solids || [])) model[s.r][s.c] = "solid";
    currentId = level.id;
    nameInput.value = level.name || "";
    rowsInput.value = String(rows); colsInput.value = String(cols); shapeInput.value = shape;
    buildGrid();
    setStatus(`Loaded "${level.name}". Editing — Save to update it.`, "ok");
  }

  /* ---------- Actions ---------- */

  function saveCurrent(): void {
    const level = collectLevel();
    const check = Levels.validate(level);
    if (!check.ok) { setStatus("Can't save: " + check.error, "error"); return; }
    const greens = level.boxes.filter((b) => !b.red).length;
    if (level.slots.length === 0 || greens === 0) {
      setStatus("Add at least one green box and one slot before saving.", "error");
      return;
    }
    currentId = Levels.save(level); // assigns id on first save
    refreshList();
    void syncFile(); // mirror to the linked file, if any
    setStatus(`Saved "${level.name}".`, "ok");
  }

  function newLevel(): void {
    currentId = null;
    nameInput.value = "";
    model = emptyModel(rows, cols);
    buildGrid();
    setStatus("New blank level.", "ok");
  }

  function clearBoard(): void {
    model = emptyModel(rows, cols);
    buildGrid();
    setStatus("Board cleared.");
  }

  function exportCurrent(): void {
    const level = collectLevel();
    const check = Levels.validate(level);
    if (!check.ok) { setStatus("Can't export: " + check.error, "error"); return; }
    Levels.exportLevel(level);
  }

  function refreshList(): void {
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
        btn("Play", () => gotoView("play", { level: lvl.id || "" })),
        btn("Export", () => Levels.exportLevel(lvl)),
        btn("Delete", () => {
          if (lvl.id) Levels.remove(lvl.id);
          if (currentId === lvl.id) currentId = null;
          refreshList();
          void syncFile();
        }, "danger")
      );

      li.append(title, meta, actions);
      listEl.appendChild(li);
    }
  }

  function btn(label: string, fn: () => void, cls?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "mini" + (cls ? " " + cls : "");
    b.addEventListener("click", fn);
    return b;
  }

  function setStatus(msg: string, kind?: string): void {
    statusEl.textContent = msg;
    statusEl.className = "ed-status" + (kind ? " " + kind : "");
  }

  /* ---------- Wiring ---------- */

  function selectTool(t: string): void {
    tool = t;
    for (const b of document.querySelectorAll<HTMLElement>("#ed-tools .tool"))
      b.classList.toggle("active", b.dataset.tool === t);
  }

  document.getElementById("ed-tools")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest(".tool") as HTMLElement | null;
    if (b && b.dataset.tool) selectTool(b.dataset.tool);
  });
  document.getElementById("ed-apply-size")!.addEventListener("click", applySize);
  document.getElementById("ed-save")!.addEventListener("click", saveCurrent);
  document.getElementById("ed-new")!.addEventListener("click", newLevel);
  document.getElementById("ed-clear")!.addEventListener("click", clearBoard);
  document.getElementById("ed-export")!.addEventListener("click", exportCurrent);
  document.getElementById("ed-export-all")!.addEventListener("click", () => Levels.exportAll());
  document.getElementById("ed-import-file")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = Levels.importJSON(String(reader.result));
      if (res.error) setStatus("Import failed: " + res.error, "error");
      else setStatus(`Imported ${res.added} level(s)${res.skipped ? `, skipped ${res.skipped}` : ""}.`, "ok");
      refreshList();
      void syncFile();
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = ""; // allow re-importing the same file
  });

  // "▶ Play" link → switch to the play view.
  document.getElementById("play-link")!.addEventListener("click", (e) => {
    e.preventDefault();
    gotoView("play");
  });

  /* ---------- Durable file (File System Access) ---------- */

  const fsGroup = document.getElementById("ed-fs")!;
  const fsSaveBtn = document.getElementById("ed-fs-save")!;
  const fsOpenBtn = document.getElementById("ed-fs-open")!;
  const fsReconnectBtn = document.getElementById("ed-fs-reconnect") as HTMLButtonElement;
  const fsStatusEl = document.getElementById("ed-fs-status")!;
  let fsReady = false; // confirmed read/write access to the linked file this session

  function renderFsStatus(): void {
    const name = Levels.fs.linkedName();
    if (!name) {
      fsStatusEl.textContent = "Not linked. Levels live only in this browser until you save them to a file.";
    } else if (fsReady) {
      fsStatusEl.textContent = `Linked: ${name} — changes save to this file automatically.`;
    } else {
      fsStatusEl.textContent = `Remembered ${name}. Click “Reconnect file” to load it and resume autosave.`;
    }
  }

  // Mirror the current library to the linked file after a change.
  async function syncFile(): Promise<void> {
    if (!Levels.fs.linkedName()) return;
    try {
      if (await Levels.fs.writeFile(true)) {
        fsReady = true;
        fsReconnectBtn.hidden = true;
        renderFsStatus();
      }
    } catch (e) { /* refused or failed — the localStorage cache still holds it */ }
  }

  fsSaveBtn.addEventListener("click", async () => {
    try {
      const name = await Levels.fs.bindNew();
      if (name) {
        fsReady = true;
        fsReconnectBtn.hidden = true;
        renderFsStatus();
        setStatus(`Saved your levels to ${name}.`, "ok");
      }
    } catch (e) { /* picker cancelled */ }
  });

  fsOpenBtn.addEventListener("click", async () => {
    try {
      const res = await Levels.fs.openFile();
      if (res) {
        fsReady = true;
        fsReconnectBtn.hidden = true;
        refreshList();
        renderFsStatus();
        setStatus(`Loaded ${res.loaded} level(s) from ${res.name}.`, "ok");
      }
    } catch (e) { /* picker cancelled */ }
  });

  fsReconnectBtn.addEventListener("click", async () => {
    try {
      const res = await Levels.fs.pull();
      if (res) {
        fsReady = true;
        fsReconnectBtn.hidden = true;
        refreshList();
        renderFsStatus();
        setStatus(`Reconnected ${res.name} — ${res.loaded} level(s) loaded.`, "ok");
      }
    } catch (e) { /* refused */ }
  });

  function initDurableFile(): void {
    if (!Levels.fs.supported) { fsGroup.hidden = true; return; }
    renderFsStatus();
    Levels.fs.reconnect().then((st) => {
      if (!st) return;
      if (st.ready) { fsReady = true; refreshList(); }
      else { fsReconnectBtn.hidden = false; fsReconnectBtn.textContent = `🔗 Reconnect ${st.name}`; }
      renderFsStatus();
    }).catch(() => { /* ignore */ });
  }

  /* ---------- Boot ---------- */

  rowsInput.value = String(rows);
  colsInput.value = String(cols);
  shapeInput.value = shape;
  model = emptyModel(rows, cols);
  selectTool("box");
  buildGrid();
  refreshList();
  initDurableFile();

  // If arriving with ?edit=<id> (or #editor?edit=<id>), open that level.
  const editId = routeParams().get("edit");
  if (editId) {
    const lvl = Levels.get(editId);
    if (lvl) loadIntoEditor(lvl);
  }
})();
