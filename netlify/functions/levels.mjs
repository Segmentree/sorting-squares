import { getStore } from "@netlify/blobs";

const ALLOW = process.env.ALLOW_ORIGIN || "*";
const MAX_BYTES = 256 * 1024;
const MAX_LEVELS = 200;
const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

const cors = {
  "Access-Control-Allow-Origin": ALLOW,
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });

  const key = new URL(req.url).searchParams.get("key");
  if (!key || !KEY_RE.test(key)) return json(400, { error: "bad key" });

  const store = getStore("levels");

  if (req.method === "GET") {
    const data = await store.get(key, { type: "json", consistency: "strong" });
    return json(200, { levels: data?.levels ?? [], updatedAt: data?.updatedAt ?? 0 });
  }

  if (req.method === "PUT") {
    const body = await req.text();
    if (body.length > MAX_BYTES) return json(413, { error: "payload too large" });
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(400, { error: "invalid json" }); }
    const levels = Array.isArray(parsed.levels) ? parsed.levels.slice(0, MAX_LEVELS) : [];
    const updatedAt = Date.now();
    await store.setJSON(key, { levels, updatedAt });
    return json(200, { ok: true, count: levels.length, updatedAt });
  }

  return json(405, { error: "method not allowed" });
};

export const config = { path: "/levels" };
