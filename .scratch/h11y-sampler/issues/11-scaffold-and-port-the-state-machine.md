# Scaffold the app and port the state machine

Type: task
Status: resolved
Blocked by:

## Question

The directory is not a git repository yet: `git init` first, commit the
map, `CONTEXT.md`, and `/prototypes/` so the relic is in history, then
create the Vite + React + TypeScript project at the repo root (static
build, no server), and port the pure state machine and keymap from
`/prototypes/keymap-prototype.html` into a typed module with unit tests
covering every walkthrough in the prototype (mark and name, export one,
tap versus hold intents, overlap and batch export, edit/rename/delete/undo,
Tab with no regions). No waveform, audio, or export yet: a placeholder
page that shows the status bar and state panel driven by the real keys is
enough to prove the port. Leaves the app runnable with `npm run dev`.

## Answer

Done 2026-09-03. Two commits on `main`: the map, glossary, spec, and
prototype; then the scaffold.

- Vite 6 + React 18 + TypeScript 5, static build with a relative `base`
  so the bundle works on GitHub Pages and Cloudflare Pages. Vitest 3.
- `src/core/chopper.ts`: the Core, ported from the prototype with types
  for State, Action, KeyEvent, Region, Draft, Prompt, Play, ExportReq,
  and Settings. Same rules, same names; `play` and `exportReq` are intents
  with sequence numbers.
- `src/core/chopper.test.ts`: 33 Seam B tests, one per prototype
  walkthrough plus edges (anchors cannot cross, Tab with no Regions,
  deleting the last Region, undo across modes, selection surviving mode
  switches, automatic renumbering, the prompt owning the keyboard, the
  zoom-relative ladder, J floor and K cap, sanitize cases, collisions
  with defaults, index padding). A `Driver` class replays key specs like
  `Shift+KeyH`; it is the shape for every later Core test.
- Placeholder Shell in `src/App.tsx`: status bar, state panel, toast,
  shake, and the name prompt, driven by the real keys through one
  keydown/keyup listener, on a silent 30-second stand-in Source.
- `npm run dev`, `npm test`, `npm run build` all green.

Facts for later tickets: the fine step is 1440 frames at fit zoom on a
1000 px view of a 30 s file; the Shell must dispatch `setViewPx` when
the waveform resizes; the Core's `sanitize` is the single sanitizer the
export ticket reuses.
