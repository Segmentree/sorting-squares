import { type Level, type ImportResult, normalize } from "./format.js";

export const KEY = "sortingSquares.levels";
const REVOKE_DELAY_MS = 1000;

let onChange: () => void = () => {};
export function setOnChange(cb: () => void): void { onChange = cb; }

export function loadAll(): Level[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
export function persist(list: Level[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  onChange();
}

export function uid(): string {
  return "lvl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function list(): Level[] { return loadAll(); }
export function get(id: string): Level | null { return loadAll().find((l) => l.id === id) || null; }

export function save(level: Level): string {
  const all = loadAll();
  if (!level.id) level.id = uid();
  level.updatedAt = Date.now();
  const i = all.findIndex((l) => l.id === level.id);
  if (i >= 0) all[i] = level; else all.push(level);
  persist(all);
  return level.id;
}

export function remove(id: string): void { persist(loadAll().filter((l) => l.id !== id)); }

export function importJSON(text: string): ImportResult {
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

export function download(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function exportLevel(level: Level): void {
  download(JSON.stringify(level, null, 2), safeName(level.name) + ".json");
}
export function exportAll(): void {
  download(JSON.stringify(loadAll(), null, 2), "sorting-squares-levels.json");
}

function safeName(name: string): string {
  return (name || "level").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "level";
}
