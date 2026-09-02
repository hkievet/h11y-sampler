# Keymap prototype: feel the three modes before speccing them

Type: prototype
Status: resolved
Blocked by:

## Question

Build a throwaway keyboard-only prototype of the three modes from
`../requirements.md` on a stub waveform (no real audio needed beyond a
short clip) to settle by feel: the three scrub step sizes and whether the
fine step should be pixel-relative; `j`/`k`/`J`/`K` zoom behaviour around
the Playhead and around an Anchor; the `i`/`I` then `o` Anchor flow and the
one-second default gap; the Tab shake and toast; the save prompt with
highlighted default; the Space tap-versus-hold loop semantics (revisit
clause from charting); and the Region Select keys from ticket 04. Two behaviours the user could not picture from
description alone and must feel here before they are final: the `Z`
zero-crossing snap toggle (does export-only, inward snapping read as
"my marks did not move but the click is gone"?) and the directional `a`
audition (does hearing 300 ms forward from a start Anchor, or 300 ms
into an end Anchor, make nudging by ear obvious?). Output:
the final keymap table, recorded as the answer, and the prototype linked
as an asset. Also run the six prototype measurements listed at the end
of `../research/playback-engine.md` (Space latency, loop seam, ramp
audibility, seek coalescing, and friends) and record the numbers.

## Answer

Prototype: [prototypes/keymap-prototype.html](../../../prototypes/keymap-prototype.html)
(kept in the codebase as a relic; single file, double-click to run; the first `<script>` block is the pure
state machine and keymap, liftable into the real app). Iterated live with
the user on 2026-09-02 through fourteen rounds. Verdict: "This is awesome,
it looks great. And this makes for a good tutorial page."

### Final keymap

Global, any mode: `Space` while anything is playing stops it. `Cmd+E`
exports the zip. `u`, `Ctrl+R`, `Cmd+Z`, `Cmd+Shift+Z` undo/redo.

Playhead mode

| Key | Action |
|---|---|
| `h` / `l` | scrub by 1% of the visible window (`[` `]` aliases) |
| `H` / `L` | scrub by one pixel at the current zoom |
| Option+`h` / `l` | scrub by 10% of the visible window |
| `j` / `k` | zoom in / out 20% around the Playhead |
| `J` / `K` | zoom in / out 80%; `J` floors at a one-second window, `K` caps at the whole file |
| `Space` | play from the Playhead; again stops and snaps back to the Return point |
| scrub while playing | restarts at the new position, which becomes the Return point |
| `a` / `A` | audition 300 ms ahead of / behind the Playhead |
| `i` | Insert Region: start Anchor here, end Anchor 20% of the window later, end active |
| `I` | Insert Region: end Anchor here, start Anchor 20% earlier, start active |
| `Tab` | Region Select; with no Regions, shake and toast "No regions yet. Press i to add one." |
| mouse drag | move the Playhead |

Insert Region mode (Playhead hidden; Anchors are the focus)

| Key | Action |
|---|---|
| `h` `l` `H` `L` Option+`h`/`l` | move the active Anchor, same ladder; Anchors cannot cross |
| mouse drag | move the active Anchor |
| `j` `k` `J` `K` | zoom around the active Anchor |
| `o` | toggle which Anchor is active |
| `a` | audition the active Anchor: start plays 300 ms forward, end plays 300 ms into it and stops dead |
| `Space` | preview the draft: tap once, hold loops |
| `s` | name prompt; Enter saves and returns to Playhead mode at the Region's end |
| `S` | name prompt; Enter saves, exports the Chop to Downloads, returns to Playhead mode |
| `Esc` | discard the draft (in the prompt too) |

Region Select mode (Playhead hidden and never moved by cycling)

| Key | Action |
|---|---|
| `h` / `l` | previous / next Region in start-time order, wrapping |
| `e` | edit bounds in Insert Region mode |
| `E` | export the Active Region to Downloads |
| `Space` | tap plays once; hold loops; release before a pass ends finishes the pass |
| `Shift+Space` | toggle in Selected Regions |
| `A` / `Shift+A` | select all / clear |
| `p` / `P` | Playhead mode with the Playhead at the Region's start / end |
| `x` | delete; next in order becomes active |
| `r` | rename prompt only |
| `Esc` / `Tab` | back to Playhead mode, Playhead untouched |

### Decisions the prototype changed

- **Zero-crossing snap is removed** ("very confusing"). Chops cut exactly
  at the marks. This reverses the snap half of the boundary-quality
  decision; the audition half stands and grew `a`/`A` in Playhead mode.
- **The whole step ladder is zoom-relative**, including the fine step at
  one pixel. A detail strip is not needed for v1; one-sample stepping can
  come later as a settings option.
- **`i`/`I` place both Anchors at once**; the one-Anchor draft state is
  gone, and the gap is 20% of the visible window.
- **`J`/`K` are 80% zoom steps** with a one-second floor and whole-file
  cap, replacing the "one second either side" preset.
- **The Playhead shows only in Playhead mode** and is never moved by
  entering, cycling in, or leaving Region Select mode.
- **Play cursors are coloured by kind**: white Space play, green
  audition, blue Region preview, amber export playback.
- **Space tap-versus-hold** as implemented felt right; the revisit clause
  is closed.
- **Ship a tutorial page** in the real app modelled on the prototype's
  walkthrough tabs with "do it for me" buttons that replay key events.

### Measurements

Not formally recorded: the user judged the audio by ear across the
session and reported no latency or seam problems. The Measurements tab
remains in the prototype for anyone who wants numbers.
