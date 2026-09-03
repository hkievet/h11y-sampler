# Export: single WAV, zip, folder write

Type: task
Status: open
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
