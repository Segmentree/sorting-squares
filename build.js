#!/usr/bin/env node
/* Build ONE self-contained HTML file containing both the game and the editor.
 *
 * Each page is first fully inlined (its CSS and every local <script> embedded),
 * then both are bundled into a shell document that shows one at a time inside an
 * <iframe srcdoc>, routed by the URL hash (#play / #editor). The result runs by
 * double-clicking in any browser on Windows, macOS, or Linux — no server. */

const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Inline a page's stylesheet and local scripts into one HTML string.
function inline(htmlFile) {
  let html = read(htmlFile);
  html = html.replace(/<link rel="stylesheet" href="([^"]+\.css)"\s*\/?>/g,
    (m, href) => `<style>\n${read(href)}\n</style>`);
  html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (m, src) => {
    if (/^https?:\/\//.test(src)) return m; // leave CDN scripts alone
    return `<script>\n${read(src)}\n</script>`;
  });
  if (/href="[^"]+\.css"|src="[^"]+\.js"/.test(html)) {
    console.warn(`Warning: ${htmlFile} still has an un-inlined reference.`);
  }
  return html;
}

// Embed an HTML string safely inside a <script> as a JS string literal:
// JSON.stringify handles quotes/newlines; we also neutralise any "</script"
// so it can't terminate the outer script during HTML parsing.
function embed(s) {
  return JSON.stringify(s).replace(/<\/script/gi, "<\\/script");
}

const playHtml = inline("index.html");
const editorHtml = inline("level-editor.html");

// Build stamp — epoch milliseconds drives a unique filename; ISO form goes
// inside the file for readability.
const buildMs = Date.now();
const buildStamp = new Date(buildMs).toISOString();

const shell = `<!DOCTYPE html>
<!-- Sorting Squares — built ${buildStamp} -->
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="build" content="${buildStamp}" />
<title>Sorting Squares</title>
<style>
  html, body { margin: 0; height: 100%; background: #161a23; }
  #view { display: block; border: 0; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<iframe id="view" title="Sorting Squares"></iframe>
<script>
var PLAY_HTML = ${embed(playHtml)};
var EDITOR_HTML = ${embed(editorHtml)};
function route() {
  var h = location.hash.replace(/^#/, "");
  var isEditor = h.indexOf("editor") === 0;
  document.getElementById("view").srcdoc = isEditor ? EDITOR_HTML : PLAY_HTML;
}
window.addEventListener("hashchange", route);
route();
<\/script>
</body>
</html>
`;

const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });
const fileName = `sorting-squares-${buildMs}.html`;
const outFile = path.join(outDir, fileName);
fs.writeFileSync(outFile, shell);

// Remove older multi-file / non-stamped artifacts if present.
for (const stale of ["index.html", "level-editor.html", "sorting-squares.html"]) {
  const p = path.join(outDir, stale);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`Built dist/${fileName} (${kb} KB) — build ${buildStamp}`);
console.log("Open it in any browser — no server required. Play and editor are both inside this one file.");
