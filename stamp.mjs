// Build step: write a cache-busted `dist/` for deploy.
//
// Appends one shared `?v=<hash>` (over the compiled JS + CSS) to every asset
// URL — the entry <script>, the import specifiers inside each module, and the
// stylesheet link — so a deploy can never serve new HTML against old cached JS.
// Source files stay unstamped; only `dist/` is versioned.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const jsDir = join(root, "js");
const outDir = join(root, "dist");
const outJsDir = join(outDir, "js");

const HTML = ["index.html", "level-editor.html"];
const CSS = ["style.css"];

const jsFiles = readdirSync(jsDir).filter((f) => f.endsWith(".js"));

// Hash the original contents so stamping itself doesn't shift the hash.
const hash = (() => {
  const h = createHash("sha256");
  for (const f of [...jsFiles.map((f) => join(jsDir, f)), ...CSS.map((f) => join(root, f))]) {
    h.update(readFileSync(f));
  }
  return h.digest("hex").slice(0, 10);
})();
const v = `?v=${hash}`;

const stampImports = (code) => code.replace(/(\bfrom\s*")(\.\/[^"]+?\.js)(")/g, `$1$2${v}$3`);
const stampHtml = (html) =>
  html
    .replace(/(<script[^>]*\bsrc=")(js\/[^"]+?\.js)(")/g, `$1$2${v}$3`)
    .replace(/(<link[^>]*\bhref=")(style\.css)(")/g, `$1$2${v}$3`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outJsDir, { recursive: true });

for (const f of jsFiles) writeFileSync(join(outJsDir, f), stampImports(readFileSync(join(jsDir, f), "utf8")));
for (const f of HTML) writeFileSync(join(outDir, f), stampHtml(readFileSync(join(root, f), "utf8")));
for (const f of CSS) copyFileSync(join(root, f), join(outDir, f));

console.log(`Stamped dist/ with ?v=${hash} (${jsFiles.length} modules, ${HTML.length} pages). Deploy dist/.`);
