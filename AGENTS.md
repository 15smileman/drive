# Repository Guidelines

## Project Structure & Module Organization
- `index.html` loads the canvas HUD, attaches controls, and is the entry point for parking scenarios; keep new UI sections modular so they can be toggled without extra routing.
- `script.js` owns the simulation loop, game state, and physics helpers; group additions near existing constructors (`Game`, `Controls`) to keep the update cycle readable.
- `styles.css` defines the dashboard layout with 2-space indentation and descriptive class names; extend sections like `.simulation` instead of inlining styles.
- `parallel_parking.mp4` is the showcase clip served from the root; store future large assets under `/assets` and reference them via relative paths.

## Build, Test, and Development Commands
- `python -m http.server 8000` (run in the repo root) - serves the static bundle at `http://localhost:8000/index.html` for rapid iteration.
- `npx serve@latest .` - alternative zero-config server; add `--single` when experimenting with history API routes.
- `npm run lint` - add this script once ESLint is configured; it is the expected hook for style checks before merging.

## Coding Style & Naming Conventions
- Use 2-space indentation, trailing semicolons, and prefer `const`/`let`; keep physics constants in `UPPER_SNAKE_CASE` as in the current header block.
- Favor `camelCase` for functions and DOM refs (`resetBtn`), and kebab-case selectors in CSS (`.hud-panel`).
- Document non-obvious math with a brief `//` comment, and avoid introducing unnamed magic numbers inside loops.

## Testing Guidelines
- Manual drive-throughs in Chrome or Edge are the primary check: confirm HUD values, boundary collisions, and reset behavior.
- Use DevTools performance trace to spot frame drops when altering physics; logging should be cleaned up before pushing.
- File issues for missing automated tests; mark scenarios as `TODO(test)` inline so they surface during reviews.

## Commit & Pull Request Guidelines
- No git history ships with this archive; adopt Conventional Commit-style subject lines (e.g., `feat: add dynamic parking cones`) and keep imperatives under 72 chars.
- Describe gameplay impacts and testing evidence in the body; attach before/after GIFs when physics or HUD visuals change.
- Pull requests should list reproduction steps, link to tracking tickets, and note any asset size changes to keep deployment reviews quick.
