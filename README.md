# Sorting Squares

A small browser puzzle game: move every **green box** onto a **yellow slot**.
Each slot has a dark wall on one edge — boxes can only enter from an open side,
and they find a path around static boxes (boxes that are mid-move pass through
each other). The game is won when every box sits on a slot.

Plain HTML/CSS + TypeScript compiled to native ES modules — no runtime
dependencies, no bundler, no backend. Served as static files (locally or on
GitHub Pages).

## Features

- **Multiple cell shapes** — square (4), pentagon (5, a Cairo-style tiling), and
  hexagon (6). The grid, pathfinding, and walls all work on a shared tiling
  abstraction.
- **Pathfinding with animation** — boxes trace a valid route cell-to-cell.
- **Box & obstacle types** — green boxes must reach slots and route around other
  boxes. **Red boxes** roam free: they slip through other boxes *and* slot walls,
  never need a slot (not part of the win), and act as movable obstacles — only
  holes and solids stop them. **Solid blocks** are visible cells nothing can pass;
  **holes** are invisible ones that also block movement.
- **Level editor** — design levels (place green/red boxes, slots, solids, holes;
  rotate each slot's wall), save them, and export/import as JSON.
- **Random games** — configurable grid size, shape, green/red box, slot and
  solid-block counts.
- **Durable level storage** — `localStorage` is the working store, keyed to the
  site's origin. Because the game is served from one stable URL (GitHub Pages),
  saved levels survive every new deploy. For a copy that also survives clearing
  the browser or switching browsers, the editor can bind your library to a real
  JSON file (**Save to file… / Open levels file…**) via the File System Access
  API; the handle is remembered in IndexedDB so a new session reconnects with one
  click and edits autosave to the file. Available in Chromium browsers; others
  fall back to Export / Import. Settings also persist in `localStorage`.

## Run it

The source is **TypeScript** (in `src/`), compiled to native ES modules in
`js/`. Because ES modules don't load over `file://`, run it through the bundled
local server:

```sh
npm install
npm run dev        # compile once (tsc) + start http://localhost:8139
```

- Open **http://localhost:8139/** to play, **/level-editor.html** to edit.
- For live recompiles: `npm run watch` (tsc in watch mode) in one terminal and
  `npm run serve` in another, then refresh the browser. (Dev serves the
  unstamped source from the repo root — the local cache doesn't matter there.)
- `npm run build` compiles `src/*.ts` → `js/*.js`, then `stamp.mjs` writes the
  deployable, cache-busted `dist/`. `npm run preview` builds and serves `dist/`
  so you can check the production output. `npm run typecheck` type-checks only.

The compiler emits **ES modules** (`tsconfig.json`: `module: ESNext`); each page
loads a single entry module (`index.html` → `js/game.js`, `level-editor.html` →
`js/editor.js`) that imports the rest. Import specifiers use explicit `.js`
extensions so the browser resolves them natively — no bundler.

### Cache-busting (`stamp.mjs`)

GitHub Pages caches assets for ~10 minutes, so a deploy could otherwise leave a
returning visitor with *new HTML loading old JS* — which crashes. To prevent
that, the build appends one shared `?v=<hash>` (derived from the compiled JS +
CSS) to every asset URL: the entry `<script>`, the `import` specifiers inside
each module, and the stylesheet link. When any asset changes the hash changes,
so the browser always fetches a fresh, **consistent** set — old and new files
can never mix. Source files stay unstamped; only `dist/` is versioned.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which runs
`npm run build` and publishes the cache-busted **`dist/`** to GitHub Pages at
<https://segmentree.github.io/sorting-squares/>. Hosting at one stable URL is
what lets players keep their saved levels across every deploy (see *Durable
level storage* above).

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` / `level-editor.html` | Play and editor pages (each loads one entry module) |
| `src/game.ts` | Game logic, rendering, animation, pathfinding (play entry) |
| `src/editor.ts` | Level editor logic (editor entry) |
| `src/geometry.ts` | Tiling abstraction (square / pentagon / hexagon) + types |
| `src/levels.ts` | Level format, storage (localStorage + File System Access), JSON import/export |
| `src/nav.ts` | Navigation helper between the play and editor pages |
| `src/globals.d.ts` | Ambient types (File System Access API) |
| `style.css` | Styles |
| `serve.mjs` | Zero-dependency local static server (`npm run serve`, or `… dist` to preview) |
| `stamp.mjs` | Post-`tsc` step: writes the cache-busted `dist/` for deploy |
| `.github/workflows/deploy-pages.yml` | Build + deploy `dist/` to GitHub Pages on push to `main` |
| `tsconfig.json` | TypeScript config (ES modules) |
| `js/`, `dist/` | Build outputs (git-ignored) |
