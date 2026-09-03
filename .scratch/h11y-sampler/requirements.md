# Settled during charting (2026-09-02)

Everything here was decided in the charting session and is not up for
re-litigation inside tickets. Tickets refine the edges; they do not redraw
this. Vocabulary is in `/CONTEXT.md`.

## Product

- Static, client-side, Vite + React + TypeScript, wavesurfer.js 7 + Regions
  plugin, JSZip. Hostable on GitHub Pages / Cloudflare Pages.
- Chrome-only is acceptable when it buys a more robust API.
- Primary scenario: sample hunting in a long field recording. Continuous
  live sets and gapped vinyl rips are supported by the same keys but do not
  drive ergonomics.
- Longest Source to design for: 60 minutes. Format usually WAV.
- WAV is the only output format. Output matches the Source: PCM WAV passes
  through byte-exact (24-bit and float preserved); decoded Sources export
  as 16-bit PCM at the Source rate.
- Regions may overlap. There is no split operation.
- Sample-level boundary precision is a requirement. Chops cut exactly at
  the marks; there is no zero-crossing snap and there are no fades.
- Default Chop name is `<source-basename>-<index>`, zero-based, in
  start-time order, zero-padded to the count width at export. A typed name
  replaces the whole default. The name IS the filename, sanitized per the
  filename rules decision; collisions get ` (2)` and a badge, and the
  sanitized name previews live in the save prompt when it differs.
- The app ships a tutorial page modelled on the prototype's walkthrough
  tabs, each step with a "do it for me" button that replays the keys.

## Persistence

- Reload restores everything from a stored file handle after one Enter
  keypress; fingerprint-keyed Regions restore on re-drop as fallback.
- Autosave on every undo step. Zoom persists per Source; the export
  folder handle persists. Every zip carries a `regions.json`.

## Three modes

Final keymap, verified by hand in the keymap prototype
(`/prototypes/keymap-prototype.html`, kept as a relic). Mode is always visible in a status
bar that also shows the Playhead time, the three step sizes in real
units, the zoom, Region and Selected counts, and what is playing.

Global in every mode: `Space` while anything is playing stops it.
`Cmd+E` exports the zip (Selected Regions, or all). `u`, `Ctrl+R`,
`Cmd+Z`, `Cmd+Shift+Z` undo and redo. All matching is on `event.code`.
Space and Tab never reach the browser.

The step ladder is relative to the visible window, so zoom is the
precision control: plain = 1% of the window, fine = one pixel at the
current zoom, coarse = 10% of the window.

### Playhead mode (default; the red Playhead shows only here)

| Key | Action |
|---|---|
| `h` / `l` | scrub by the plain step (`[` `]` are aliases) |
| `H` / `L` | scrub by the fine step |
| Option+`h` / `l` | scrub by the coarse step |
| `j` / `k` | zoom in / out 20% around the Playhead |
| `J` / `K` | zoom in / out 80%; `J` floors at a one-second window, `K` caps at the whole file |
| `Space` | play from the Playhead; again stops and snaps back to the Return point |
| scrub while playing | playback restarts at the new position, which becomes the Return point |
| `a` / `A` | audition 300 ms ahead of / behind the Playhead |
| `i` | Insert Region: start Anchor at the Playhead, end Anchor 20% of the window later, end Anchor active |
| `I` | Insert Region: end Anchor at the Playhead, start Anchor 20% earlier, start Anchor active |
| `Tab` | Region Select mode; with no Regions, shake the waveform and toast "No regions yet. Press i to add one." |
| mouse drag | move the Playhead |

### Insert Region mode (Playhead hidden; the green Anchors are the focus)

| Key | Action |
|---|---|
| `h` `l` `H` `L` Option+`h`/`l` | move the active Anchor by the same ladder; Anchors cannot cross |
| mouse drag | move the active Anchor |
| `j` `k` `J` `K` | zoom around the active Anchor |
| `o` | toggle which Anchor is active |
| `a` | audition the active Anchor: a start Anchor plays 300 ms forward, an end Anchor plays the 300 ms into it and stops dead |
| `Space` | preview the draft: tap plays once, hold loops |
| `s` | name prompt with the default name highlighted; Enter saves and returns to Playhead mode with the Playhead at the Region's end |
| `S` | same prompt; Enter saves, exports the Chop to Downloads, and returns to Playhead mode |
| `Esc` | discard the draft, also from inside the prompt; Playhead unchanged |

Entering via `e` from Region Select mode loads that Region's bounds with
the end Anchor active; saving updates it in place as one undo step.

### Region Select mode (Playhead hidden and never moved by this mode)

| Key | Action |
|---|---|
| `Tab` (from Playhead mode) | the Region nearest the Playhead becomes active, preferring one that contains it |
| `h` / `l` | previous / next Region in start-time order, wrapping; the view follows, the Playhead stays |
| `e` | edit bounds in Insert Region mode |
| `E` | export the Active Region to Downloads |
| `Space` | tap plays the Active Region once; hold loops it; release before a pass ends finishes the pass; a tap under 200 ms always plays one full pass |
| `Shift+Space` | toggle the Active Region in Selected Regions |
| `a` / `c` | select all / clear the selection (`Shift+A` also clears) |
| `p` / `P` | Playhead mode with the Playhead at the Region's start / end |
| `x` | delete; the next Region in order becomes active; deleting the last returns to Playhead mode with a toast |
| `r` | rename prompt only, existing name highlighted |
| `Esc` / `Tab` | back to Playhead mode; Playhead and Selected Regions untouched |

### Play cursors

The moving cursor is coloured by what is playing: white for Space play,
green for an audition, blue for a Region preview, amber for playback of
an exported Chop. It sits on its start point during the scheduling lead.

### Names

A Region whose name was never typed is automatic: it shows as
`<basename>-<index>` and renumbers by position; at export the index is
zero-padded to the count width. Accepting the highlighted default in the
prompt keeps it automatic. Typing anything else makes it fixed.
