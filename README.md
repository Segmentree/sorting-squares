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

Just open `index.html` in any modern browser — no server required.

Or build a single self-contained file (both the game and the editor bundled
into one HTML via an `<iframe srcdoc>` router):

```sh
node build.js
# -> dist/sorting-squares-<timestamp>.html  (open directly in any browser)
```

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Play page |
| `level-editor.html` | Level editor page |
| `game.js` | Game logic, rendering, animation, pathfinding |
| `editor.js` | Level editor logic |
| `geometry.js` | Tiling abstraction (square / pentagon / hexagon) |
| `levels.js` | Level format, storage, JSON import/export |
| `nav.js` | Navigation helper (two-file dev mode and single-file build) |
| `style.css` | Styles |
| `build.js` | Bundles both pages into one standalone HTML file |
