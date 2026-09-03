# Persistence: reload restore and autosave

Type: task
Status: resolved
Blocked by:

## Question

Per-Source record keyed by fingerprint (name, size, lastModified) holding
regions, selected, playhead, view, and the `FileSystemFileHandle` from
`getAsFileSystemHandle` when the drop provides one; written on every
undo step and selection change; twenty most recent kept. Fresh load with
a stored handle offers "Press Enter to reopen `<name>`" and restores on
`requestPermission`; a re-drop with a matching fingerprint restores
without the handle; a mismatch restores with a toast. Settings in
localStorage; export folder handle in IndexedDB. Leaves the app runnable
across reloads.

## Answer

Done 2026-09-03, one commit. `src/persist/store.ts`, no React, no
dependency (idb-keyval is Apache-2.0, so a 40-line IndexedDB wrapper
instead).

- **Session record per Source**, keyed by fingerprint (name, size,
  lastModified): the `FileSystemFileHandle` from
  `DataTransferItem.getAsFileSystemHandle` when the drop provides one,
  regions, `nextId`, selection, playhead, view, `savedAt`. A `recent`
  list keeps the twenty newest and deletes older records.
- **Reopen offer:** the drop zone shows "Press Enter to reopen
  `<name>` with its N regions" when the most recent session has a
  handle; Enter (or a click) runs `queryPermission`/`requestPermission`
  for read, then `getFile()`, then the normal open path. Refusal or a
  moved file falls back to the drop zone with a message.
- **Restore on mount:** exact fingerprint first, else the most recent
  session with the same file name, restored with a toast that the file
  changed and marks may not line up. The Core's `restore` action clamps
  regions to the file, drops empty ones, bumps `nextId`, prunes the
  selection, and starts with no undo history (tested).
- **Autosave** 200 ms after any change to regions, selection, playhead,
  or view; that covers every undo step.
- **Export folder handle** in IndexedDB, loaded on mount and saved when
  picked. **Settings** in localStorage, merged into the initial state.

Unverified in a browser this session (extension not connected): the
handle round-trip and the permission prompt. 56 tests green.
