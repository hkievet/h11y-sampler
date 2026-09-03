# Export: single WAV, zip, folder write

Type: task
Status: resolved
Blocked by:

## Question

`E` downloads one Chop; `S` saves and downloads; `Cmd+E` builds
`<basename>-chops.zip` with JSZip `STORE`, entries from `Source.slice`,
plus `regions.json` (frames, name, fingerprint, sample rate), Selected
or all, clearing the selection; `Cmd+Shift+E` writes the same set into a
remembered `showDirectoryPicker` folder. Names come only from the Core's
`filenames`; collision badges in the Region list. Seam B tests on the zip
contents in node where possible. Leaves the app runnable end to end:
drop, mark, name, export.

## Answer

Done 2026-09-03, one commit. `src/export/export.ts`, no React.

- **One sanitizer, three sinks.** Names come only from the Core's
  `filenames`; bytes only from `Source.slice`. `E` and `S` download one
  Chop; `Cmd+E` downloads `<basename>-chops.zip`; `Cmd+Shift+E` writes
  the same set into a folder picked once via `showDirectoryPicker` with
  `readwrite` (handle held in memory for now; Persistence stores it).
- **Zip:** JSZip 3.10 (MIT) with `STORE`, one entry per Chop plus
  `regions.json` carrying the Source name, fingerprint (name, size,
  lastModified), sample rate, frame count, and each Region's file name,
  typed name or null, and start and end in frames. Entries are passed as
  ArrayBuffers so the same code runs in node tests.
- **Core:** `exportBatch` carries `to: 'zip' | 'folder'`; a `notify`
  action lets the Shell toast outcomes. The Region list already shows
  collision badges.
- **Tests:** `src/export/export.test.ts` loads the zip back with JSZip and
  asserts entry names, `STORE`, byte-equal data chunks against the fixture,
  and the `regions.json` shape. The fixture generator now lives in
  `src/source/fixtures.ts` for Seam A to reuse. 55 tests green.

Chrome's multiple-downloads prompt will appear the first time `E` is
pressed twice; not something the app can avoid. Folder write and the
download path are unverified in a browser this session.
