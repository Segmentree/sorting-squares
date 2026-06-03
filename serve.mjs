// Minimal zero-dependency static file server for local development.
//
// ES modules need a real origin (they don't load over file://), so serve the
// project over http://localhost. Run `npm run dev` (build + serve) or, for live
// recompiles, `npm run watch` in one terminal and `npm run serve` in another.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  // Strip query/hash, default to index.html, and keep the path inside root.
  let pathname = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  if (pathname === "/") pathname = "/index.html";
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) { res.writeHead(403).end("Forbidden"); return; }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
});

server.listen(port, () => {
  console.log(`Sorting Squares dev server:
  Play:   http://localhost:${port}/
  Editor: http://localhost:${port}/level-editor.html
Press Ctrl+C to stop.`);
});
