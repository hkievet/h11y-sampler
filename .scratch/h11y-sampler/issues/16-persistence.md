# Persistence: reload restore and autosave

Type: task
Status: open
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
