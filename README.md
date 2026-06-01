# Sorting Squares

A small browser puzzle game: move every **green box** onto a **yellow slot**.
Each slot has a dark wall on one edge — boxes can only enter from an open side,
and they find a path around static boxes (boxes that are mid-move pass through
each other). The game is won when every box sits on a slot.

Pure HTML/CSS/JS — no dependencies, no backend.

## Features

- **Multiple cell shapes** — square (4), pentagon (5, a Cairo-style tiling), and
  hexagon (6). The grid, pathfinding, and walls all work on a shared tiling
  abstraction.
- **Pathfinding with animation** — boxes trace a valid route cell-to-cell.
- **Level editor** — design levels (place boxes/slots, rotate each slot's wall),
  save them, and export/import as JSON.
- **Random games** — configurable grid size, shape, box and slot counts.
- Settings and saved levels persist in `localStorage`.

## Run it

The source is **TypeScript** (in `src/`), compiled to plain JS — no runtime
dependencies. Install once, then build:

```sh
npm install
npm run build      # tsc -> js/, then bundles a single self-contained HTML file
```

- `npm run build` compiles `src/*.ts` to `js/*.js` and produces
  `dist/sorting-squares-<timestamp>.html` — both the game and the editor bundled
  into one file via an `<iframe srcdoc>` router. Open it directly in any browser.
- After building, you can also just open `index.html` (it loads `js/*.js`).
- `npm run typecheck` type-checks without emitting; `npm run watch` recompiles
  on save (handy with a static file server for live dev).

The compiler is configured as non-module (`tsconfig.json`), so each file emits a
classic global `<script>` — matching the runtime, which uses no bundler/imports.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` / `level-editor.html` | Play and editor pages (load `js/*.js`) |
| `src/game.ts` | Game logic, rendering, animation, pathfinding |
| `src/editor.ts` | Level editor logic |
| `src/geometry.ts` | Tiling abstraction (square / pentagon / hexagon) + types |
| `src/levels.ts` | Level format, storage, JSON import/export |
| `src/nav.ts` | Navigation helper (two-file dev mode and single-file build) |
| `style.css` | Styles |
| `build.js` | Bundles both pages into one standalone HTML file |
| `tsconfig.json` | TypeScript config |
| `js/`, `dist/` | Build outputs (git-ignored) |
