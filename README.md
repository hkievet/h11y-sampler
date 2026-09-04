# h11y-sampler

A keyboard-first sample chopper that runs entirely in your browser. Drop a
long recording, mark and name regions with a few keys, and leave with a zip
of WAV chops named exactly what you typed. Nothing is uploaded; a WAV
source passes through byte-exact.

Chrome is the target browser. Static build, hostable on GitHub Pages or
Cloudflare Pages.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: the pure core, filename rules, WAV parsing and slicing
npm run e2e        # Playwright in Chromium: drop, keys, zip bytes, reload, tutorial
npm run build      # dist/
```

Press `?` in the app for the tutorial, or open the demo recording from the
drop zone. Clicking a region in the list selects it and plays it once.

## Keymap

Any mode: `Space` while anything plays stops it. `Cmd+E` zips the selected
regions (or all). `Cmd+Shift+E` writes the same chops into a folder. `u`,
`Ctrl+R`, `Cmd+Z`, `Cmd+Shift+Z` undo and redo.

| Playhead mode | |
|---|---|
| `h` / `l` | scrub by 1% of the visible window |
| `H` / `L` | scrub by 10% of the visible window |
| `Opt+h` / `Opt+l` | scrub by one pixel at the current zoom |
| `j` / `k`, `J` / `K` | zoom 20%, zoom 80% (J floors at one second, K caps at the file) |
| `Space` | play from the playhead; again stops and snaps back |
| `a` / `A` | audition 300 ms ahead of / behind the playhead |
| `i` / `I` (or `v` / `V`) | insert a region starting / ending here |
| `Tab` | Region Select mode |

| Insert Region mode | |
|---|---|
| scrub and zoom keys | act on the active anchor |
| `o` | toggle which anchor is active |
| `a` | audition the active anchor |
| `Space` | preview the draft: tap once, hold loops |
| `s` or `Enter` / `S` | name and save / name, save, and export |
| `Esc` | discard |

| Region Select mode | |
|---|---|
| `h` / `l` | previous / next region by start time |
| `e` / `r` / `x` | edit bounds / rename / delete |
| `E` | export this region to Downloads |
| `Space` | tap plays once, hold loops |
| `Shift+Space`, `a`, `c` | toggle selection, select all, clear |
| `p` / `P` | Playhead mode at the region start / end |
| `Esc` / `Tab` | back to Playhead mode |

## Layout

- `src/core` the pure state machine and keymap, ported from the prototype
- `src/source` WAV fast path, decoded path, peaks
- `src/transport` media element for playback, Web Audio for previews
- `src/view` wavesurfer plus the overlay
- `src/export` single WAV, zip, folder write
- `src/persist` IndexedDB sessions, reload restore
- `src/tutorial` walkthroughs and keymap reference
- `prototypes/` the keymap prototype that settled the design (kept on purpose)
- `.scratch/h11y-sampler` the wayfinder map, spec, and research
