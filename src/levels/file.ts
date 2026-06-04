import { normalize, type Level } from "./format.js";
import { loadAll, persist, uid } from "./store.js";

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

export const fs = { supported: fsSupported, bindNew, openFile, reconnect, pull, writeFile, linkedName };
