# Reload, persistence, and which Chrome-only APIs to lean on

Type: grilling
Status: resolved
Blocked by:

## Question

Chrome-only is allowed when it buys robustness. Decide:

- Persist the Source's FileSystemFileHandle in IndexedDB so a reload
  restores Source, Regions, and Playhead with one permission prompt and
  no re-drop? Or persist only Regions keyed by a file fingerprint
  (name + size + lastModified) and require a re-drop?
- Directory write as a secondary export (Chops written straight into a
  folder via `showDirectoryPicker`), with zip staying primary?
- Autosave cadence: every Region change, or on a timer?
- What else persists (last zoom, step size, ordinal toggle) and where.

## Answer

Grilled 2026-09-02; all six recommendations adopted. Fact checked first:
Chrome stores `FileSystemFileHandle` in IndexedDB and returns it after a
reload; `requestPermission` needs a user activation (a keypress) and
`DataTransferItem.getAsFileSystemHandle()` exposes the handle on drop.

- **Full restore on reload.** On drop, keep the file handle in IndexedDB.
  On reload the page offers "Press Enter to reopen `<name>`"; one keypress
  grants permission and restores Source, Regions, Selected Regions,
  Playhead, zoom, and mode. Fallback when there is no handle or the file
  has moved: Regions persisted by fingerprint (name, size, lastModified)
  are restored on re-drop. If the fingerprint no longer matches, restore
  anyway and toast that the file changed and marks may not line up.
- **Directory write.** `Cmd+Shift+E` asks for a folder once (handle
  remembered), then writes Chops straight into it with no zip, using the
  same Selected-or-all rule as `Cmd+E`. `E` always goes to Downloads.
- **Autosave** on every undo step and selection change. Keep the twenty
  most recent Sources; drop the oldest beyond that.
- **Reopen offer:** most recent Source only. No recents list.
- **Persisted settings:** zero-crossing snap and last zoom in
  localStorage; the export folder handle in IndexedDB. Zoom restores per
  Source.
- **`regions.json` in every zip:** start and end in frames, name, Source
  fingerprint, sample rate. Export-only; import is a separate effort.
