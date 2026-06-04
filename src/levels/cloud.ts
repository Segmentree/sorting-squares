import { normalize, type Level } from "./format.js";
import { loadAll, persist } from "./store.js";

const CLOUD_URL = "https://sorting-squares-api.netlify.app/levels";
const CLOUD_KEY = "sortingSquares.cloudKey";
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_LEN = 24;
const PUSH_DEBOUNCE_MS = 1500;

function randomKey(): string {
  const a = new Uint8Array(Math.ceil((CODE_LEN * 3) / 4));
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, "").slice(0, CODE_LEN);
}
function cloudKey(): string {
  let k = "";
  try { k = localStorage.getItem(CLOUD_KEY) || ""; } catch (e) {}
  if (!CODE_RE.test(k)) {
    k = randomKey();
    try { localStorage.setItem(CLOUD_KEY, k); } catch (e) {}
  }
  return k;
}
function setCloudKey(code: string): boolean {
  const k = (code || "").trim();
  if (!CODE_RE.test(k)) return false;
  try { localStorage.setItem(CLOUD_KEY, k); } catch (e) {}
  return true;
}

function mergeLevels(a: Level[], b: Level[]): Level[] {
  const byId = new Map<string, Level>();
  for (const lvl of [...a, ...b]) {
    if (!lvl || !lvl.id) continue;
    const cur = byId.get(lvl.id);
    if (!cur || (lvl.updatedAt || 0) >= (cur.updatedAt || 0)) byId.set(lvl.id, lvl);
  }
  return [...byId.values()];
}

async function cloudPull(): Promise<number> {
  const res = await fetch(`${CLOUD_URL}?key=${encodeURIComponent(cloudKey())}`);
  if (!res.ok) throw new Error("cloud get " + res.status);
  const data = await res.json();
  const remote = (Array.isArray(data.levels) ? data.levels : [])
    .map((l: any) => normalize(l))
    .filter((l: Level | null): l is Level => !!l);
  persist(mergeLevels(loadAll(), remote));
  return loadAll().length;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void cloudPush(); }, PUSH_DEBOUNCE_MS);
}
async function cloudPush(): Promise<boolean> {
  try {
    const res = await fetch(`${CLOUD_URL}?key=${encodeURIComponent(cloudKey())}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levels: loadAll() }),
    });
    return res.ok;
  } catch (e) { return false; }
}

export const cloud = { key: cloudKey, setKey: setCloudKey, pull: cloudPull, push: cloudPush };
