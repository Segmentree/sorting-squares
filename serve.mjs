// Zero-dependency static server for local dev (ES modules don't load over file://).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root by default; pass a dir to preview a build, e.g. `node serve.mjs dist`.
// resolve() strips any trailing slash so the path guard below matches correctly.
const root = resolve(process.argv[2] || fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT) || 8139;

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
  let pathname = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  if (pathname === "/") pathname = "/index.html";
  const filePath = normalize(join(root, pathname));
  if (filePath !== root && !filePath.startsWith(root + sep)) { res.writeHead(403).end("Forbidden"); return; }

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
