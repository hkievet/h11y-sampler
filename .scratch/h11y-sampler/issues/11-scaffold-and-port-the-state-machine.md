# Scaffold the app and port the state machine

Type: task
Status: claimed
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
