# h11y-sampler spec

Status: ready-for-agent
Date: 2026-09-02
Sources: `map.md` (decisions and scope), `requirements.md` (final keymap),
`/CONTEXT.md` (vocabulary), `research/*.md` (pipeline, playback, plugin
fit, Chrome shortcuts), `/prototypes/keymap-prototype.html` (the state
machine this spec ports).

## Problem Statement

A producer has a long recording (a field recording, a live set, a vinyl
rip) and wants a handful of samples out of it. Existing browser tools
like audiotrim.app let them trim one selection at a time with the mouse
and download it under the tool's own name. Hunting twenty samples out of
an hour means twenty round trips, twenty renames in Finder, and a mouse
in the hand the whole time. Desktop DAWs can do it but drag the producer
through a project, a session, and an export dialog for what should be a
five-minute job.

## Solution

A static web page. Drop the Source once. From then on the keyboard does
everything: scrub, zoom, mark a Region with two Anchors, hear its edges,
name it, move on. Regions can overlap. When done, one chord downloads a
zip of WAV Chops, each named exactly what the producer typed, or a single
Chop goes straight to Downloads. Nothing leaves the machine. A reload
brings the whole session back after one keypress. A built-in tutorial
page teaches the three modes with replayable steps.

## User Stories

Producer means the person using the tool.

1. As a producer, I want to drop a WAV, MP3, FLAC, or M4A file onto the page and see its waveform, so that I can start hunting without setup.
2. As a producer, I want the audio to stay on my machine, so that unreleased or private recordings never touch a server.
3. As a producer, I want a 60-minute Source to load and stay responsive, so that a full field recording or set is workable.
4. As a producer, I want the mouse to be optional after the drop, so that I can keep both hands on the keyboard for repetitive work.
5. As a producer, I want a status bar that always shows the mode, Playhead time, step sizes, zoom, Region count, Selected count, and what is playing, so that I never guess what a key will do.
6. As a producer, I want `h` and `l` to scrub by a fraction of what is on screen, so that zooming in is how I get precision.
7. As a producer, I want `H` and `L` to scrub by one pixel at the current zoom, so that at maximum zoom I can place a boundary by ear at sample level.
8. As a producer, I want Option+`h`/`l` to scrub by a large fraction of the screen, so that I can cross a long Source quickly.
9. As a producer, I want `j`/`k` to zoom by 20% and `J`/`K` by 80% around the Playhead, so that I can dive into and out of a moment in two or three presses.
10. As a producer, I want `J` to stop at a one-second window and `K` at the whole file, so that repeated presses land somewhere useful.
11. As a producer, I want Space to play from the Playhead and Space again to stop and snap back to where I started, so that I can listen to a moment repeatedly.
12. As a producer, I want scrubbing during playback to restart playback there, so that I can chase a sound while listening.
13. As a producer, I want `a` and `A` to play 300 ms ahead of or behind the Playhead, so that I can place the Playhead by ear before marking.
14. As a producer, I want Space to stop whatever is playing in any mode, so that silence is always one key away.
15. As a producer, I want `i` to create a draft Region starting at the Playhead with the end Anchor handed to me, so that the common case of "the sample starts here" is one key.
16. As a producer, I want `I` to do the mirror, ending at the Playhead with the start Anchor handed to me, so that "the sample ends here" is also one key.
17. As a producer, I want the second Anchor placed a fraction of the screen away, so that the draft is visible and sensible at any zoom.
18. As a producer, I want `o` to toggle which Anchor I am moving, so that I can refine both ends without leaving the mode.
19. As a producer, I want the Anchors to refuse to cross, so that a Region can never be inverted.
20. As a producer, I want to drag the active Anchor with the mouse when I feel like it, so that the mouse is optional rather than forbidden.
21. As a producer, I want `a` in Insert Region mode to play the edge of the draft at the active Anchor, forward from a start Anchor and into an end Anchor, so that I hear exactly what the Chop will begin or end with.
22. As a producer, I want Space in Insert Region mode to preview the draft, tapping for one pass and holding to loop, so that I can judge the whole sample before saving.
23. As a producer, I want `s` to open a name prompt with a sensible default highlighted, so that typing replaces it and Enter accepts it.
24. As a producer, I want the name I type to be the filename of the Chop, so that I never rename in Finder.
25. As a producer, I want to see the sanitized filename live under the prompt when it differs from what I typed, so that there are no surprises in the zip.
26. As a producer, I want Enter on the untouched default to keep the name automatic and numbered by position, so that unnamed Chops sort correctly.
27. As a producer, I want `S` to name, save, export to Downloads, and return to Playhead mode in one go, so that a one-off sample is three keys.
28. As a producer, I want Esc to throw away a draft, from the prompt too, so that a bad mark costs nothing.
29. As a producer, I want to land back in Playhead mode at the Region's end after saving, so that I continue forward through the Source.
30. As a producer, I want Regions to overlap, so that a long loop and a one-shot inside it can both be Chops.
31. As a producer, I want Tab to enter Region Select mode on the Region nearest the Playhead, so that "that one" is the one I mean.
32. As a producer, I want Tab with no Regions to shake the waveform and tell me to press `i`, so that I learn the flow without reading docs.
33. As a producer, I want `h`/`l` in Region Select mode to walk Regions in start-time order and wrap, so that I navigate the recording, not my history.
34. As a producer, I want the Playhead to stay put while I cycle Regions and leave Region Select mode, so that I can look around and return to where I was.
35. As a producer, I want the view to follow the Active Region, so that I always see what I have selected.
36. As a producer, I want Space in Region Select mode to tap-play or hold-loop the Active Region with sample-exact loop points, so that I can audition it as a loop.
37. As a producer, I want a release before one pass ends to let the pass finish, so that a tap never cuts a sample short.
38. As a producer, I want `e` to reopen a Region's bounds in Insert Region mode, so that I can fix an edge later.
39. As a producer, I want `r` to rename without touching the bounds, so that a typo is one key away from fixed.
40. As a producer, I want `x` to delete and the next Region to become active, so that clearing bad marks is fast.
41. As a producer, I want `u` and Ctrl+R, plus Cmd+Z and Cmd+Shift+Z, to undo and redo create, delete, bounds change, and rename as single steps, so that mistakes are cheap.
42. As a producer, I want `p` and `P` to drop me into Playhead mode at the Region's start or end, so that I can continue from a Region I found.
43. As a producer, I want `E` to export the Active Region to Downloads with no prompt, so that a single Chop is one key.
44. As a producer, I want Shift+Space to toggle a Region in Selected Regions, `A` to select all, and Shift+A to clear, so that I control what the zip contains.
45. As a producer, I want the selection to survive mode switches, so that I can mark one more Region and come back to export.
46. As a producer, I want Cmd+E to zip Selected Regions, or all Regions when nothing is selected, and clear the selection, so that batch export is one chord.
47. As a producer, I want Cmd+Shift+E to write the same Chops into a folder I picked once, so that a sample library fills up without unzipping.
48. As a producer, I want a WAV Source to export byte-exact, keeping 24-bit or float, so that the Chops are as good as the recording.
49. As a producer, I want a decoded Source to export as 16-bit WAV at its own sample rate, so that compressed inputs still produce usable samples.
50. As a producer, I want colliding filenames to get a suffix and a warning badge rather than an overwrite or a refusal, so that export always works and I can see what happened.
51. As a producer, I want a `regions.json` in every zip, so that a session is reproducible and shareable.
52. As a producer, I want a reload to offer "Press Enter to reopen" and bring back the Source, Regions, selection, Playhead, and zoom, so that an accidental refresh costs one keypress.
53. As a producer, I want my Regions restored when I re-drop the same file even without that offer, so that persistence works across browsers and moved files.
54. As a producer, I want a warning if the file changed since the Regions were saved, so that I know marks may not line up.
55. As a producer, I want a tutorial page with the three modes as walkthroughs and "do it for me" buttons, so that I learn by watching keys act.
56. As a producer, I want a keymap reference on that page, so that I can look up a key without leaving the app.
57. As a producer, I want the play cursor coloured by what is playing, so that an audition, a preview, and normal playback are distinguishable at a glance.
58. As a producer, I want the Playhead hidden in Insert Region and Region Select modes, so that the Anchors or the Active Region are the only focus.
59. As a producer, I want Space and Tab never to scroll or move browser focus, so that holding Space is safe.
60. As a producer, I want the app hosted as static files on GitHub Pages or Cloudflare Pages, so that there is nothing to run.

## Implementation Decisions

### Stack and constraints

- Vite + React + TypeScript, static build, no server. wavesurfer.js 7.x
  (BSD-3) with its Regions plugin for the waveform and saved Regions.
  JSZip (MIT) for the zip. `idb-keyval` (MIT) or equivalent for
  IndexedDB. Permissive licenses only; LGPL does not qualify.
- Chrome is the target browser. The File System Access API is used for
  reload restore and folder write. No WebCodecs.
- Frames (sample index at the Source's sample rate) are the unit of truth
  everywhere below the view. Seconds are derived for display only.
- All hotkeys match on `event.code`, never `event.key`. Space and Tab are
  `preventDefault`-ed before any dispatch. Cmd+Shift+bracket, Cmd+W/T/N/Q,
  and Ctrl+Tab are unreachable in Chrome and are not bound.

### Modules and seams

Six modules, one direction of dependency: Shell depends on everything;
nothing depends on Shell.

**Core** (pure, no DOM, no audio). The state machine and keymap ported
from the prototype. Two functions: `keyToAction(state, keyEvent)` returns
an action or null; `reduce(state, action)` returns a new state. Plus
`filenames(state, regions)` and `sanitize(name)`. State shape, from the
prototype:

```
mode: 'playhead' | 'insert' | 'select'
playhead, returnPoint: frame | null
regions: { id, start, end, name | null }[]      // name null = automatic
draft: { start, end, active: 'start' | 'end', editingId | null } | null
activeId, selected: id[]
view: { win, start }, viewPx
undo, redo: regions[][]
settings: { plainPct 1, coarsePct 10, fine '1px', auditionMs 300, gapPct 20, tapMs 200 }
toast, shake, prompt: { value, def, forDraft, regionId, exportAfter } | null
play: null | { kind: 'playhead', from } | { kind: 'preview', start, end, hold } | { kind: 'audition', start, end, side }
playSeq, exportReq: { kind: 'one' | 'zip', files } | null, exportSeq
```

Actions: `scrub`, `seekTo`, `zoom`, `playToggle`, `stop`, `playbackEnded`,
`insert`, `anchor`, `save`, `cancel`, `audition`, `auditionPlayhead`,
`previewDown`, `previewUp`, `promptInput`, `promptCommit`, `promptCancel`,
`tab`, `cycle`, `edit`, `toggleSelect`, `selectAll`, `clearSelect`,
`toPlayhead`, `delete`, `rename`, `undo`, `redo`, `exportOne`,
`exportBatch`, `setSetting`, `setViewPx`. `play` and `exportReq` are
intents with a sequence number; the Shell watches the sequence and drives
Transport and Export. The Core never calls them.

**Source** (owns the one decode). `openSource(file)` sniffs the container
and returns a `Source` with `frames`, `sampleRate`, `channels`, and:
`peaks(buckets, range)` for the waveform, `window(range)` returning
Int16 per channel for a bounded range, `slice(range)` returning a Blob
that is a complete WAV Chop, and `media()` returning the original File
for the media element. Two implementations behind it:

- `WavSource`: PCM, float, and extensible WAV, including RF64 and files
  with `JUNK`/`bext`/`iXML` chunks. `slice` is a rewritten header plus a
  `File.slice` byte range, sample-aligned, with the original `fmt ` chunk
  copied verbatim so bit depth and channel count pass through byte-exact.
  Never loads the data chunk onto the heap.
- `DecodedSource`: `decodeAudioData` on an AudioContext created at the
  container's sample rate (Chrome otherwise resamples), converted in
  chunks to interleaved Int16, AudioBuffer dropped. `slice` writes 16-bit
  PCM. A soft warning toast above 60 minutes; no hard cap.

Peaks are computed by Source and passed to wavesurfer with `duration`, so
wavesurfer never decodes.

**Transport** (Web Audio and one media element). Two engines behind one
interface, all in frames: `play(from)` and `stop()` on a media element
over a blob URL of `media()`; `prepare(range)`, `previewStart`,
`previewRelease`, `previewOnce`, `audition(frame, side)`, `cancel()` on
per-range `AudioBufferSourceNode`s built from `window(range)` with
`loop`/`loopStart`/`loopEnd`. `position()` is a pure clock read consumed
by the Shell's single animation frame loop. Events: `statechange`,
`ended`, `error`. Rules from the prototype: start 8 ms ahead; release
before one pass schedules a frame-exact stop at the pass end; release
after a pass ramps gain to zero over 8 ms then stops; a tap under 200 ms
always plays one full pass; scrub during play is a media seek coalesced
to one per animation frame. Preview buffers are built when the Active
Region or draft changes, not on keydown, and capped near ten minutes.

**Waveform view**. wavesurfer for the rendered waveform and the saved
Regions (created with `drag:false`, `resize:false`, no `content`,
`pointer-events:none`). A custom overlay draws everything the keyboard
model needs: the draft band and its two Anchors with the active one
emphasised, the Active Region highlight, name labels with an "(auto)"
marker, selection marks, the Playhead (Playhead mode only), and the
coloured play cursor (white Space play, green audition, blue preview,
amber export playback). Zoom is `zoom(px per second)` plus
`setScrollTime` arithmetic to centre on the focus frame; the focus is the
Playhead, the active Anchor, or the Active Region's start by mode. Mouse
drag on the waveform moves the Playhead in Playhead mode and the active
Anchor in Insert Region mode.

**Export**. `filenames` from Core decides names. The zip is JSZip with
`STORE` compression, entries from `Source.slice`, plus `regions.json`
(start and end in frames, name, Source fingerprint, sample rate). Zip
name `<basename>-chops.zip`. Single export is one Blob download. Folder
write uses a remembered `FileSystemDirectoryHandle` with `readwrite`.

**Persistence**. Per-Source record keyed by fingerprint (name, size,
lastModified): regions, selected, playhead, view, and the
`FileSystemFileHandle` when the drop provided one. Written on every undo
step and selection change; twenty most recent Sources kept. A fresh load
with a stored handle shows "Press Enter to reopen `<name>`"; Enter calls
`requestPermission` and restores everything. A re-drop of a file whose
fingerprint matches restores regions without the handle. Mismatched
fingerprint restores anyway with a toast. Settings (step percentages,
audition length, gap) in localStorage; the export folder handle in
IndexedDB.

**Shell** (React). Drop zone, status bar, toast and shake, the name
prompt (a real input that owns the keyboard while open), the Region
list with export filenames and collision badges, the tutorial page, and
the one `keydown`/`keyup` listener that feeds Core. The tutorial page is
the prototype's walkthrough tabs rebuilt: numbered steps, each with a
"do it for me" button that replays the same key events through the same
listener, plus the keymap reference.

### The keymap

Verbatim from `requirements.md`; the Core's `keyToAction` is the single
place it is encoded.

Global, any mode: `Space` while anything is playing stops it. `Cmd+E`
exports the zip. `Cmd+Shift+E` writes Chops to the folder. `u`,
`Ctrl+R`, `Cmd+Z`, `Cmd+Shift+Z` undo and redo.

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

Insert Region mode (Playhead hidden)

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
| `Esc` | discard the draft, from the prompt too |

Region Select mode (Playhead hidden and never moved)

| Key | Action |
|---|---|
| `Tab` from Playhead mode | the Region nearest the Playhead becomes active, preferring one that contains it |
| `h` / `l` | previous / next Region in start-time order, wrapping; the view follows |
| `e` | edit bounds in Insert Region mode |
| `E` | export the Active Region to Downloads |
| `Space` | tap plays once; hold loops; release before a pass ends finishes the pass |
| `Shift+Space` | toggle in Selected Regions |
| `A` / `Shift+A` | select all / clear |
| `p` / `P` | Playhead mode with the Playhead at the Region's start / end |
| `x` | delete; next in order becomes active; deleting the last returns to Playhead mode |
| `r` | rename prompt only |
| `Esc` / `Tab` | back to Playhead mode, Playhead and selection untouched |

### Names and filenames

Automatic name is `<basename>-<index>`, zero-based in start-time order,
zero-padded to the count width at export. Accepting the highlighted
default keeps the name automatic; typing anything else fixes it. At
export: NFC, keep Unicode, `/ \ : * ? " < > |` and control characters to
`_`, collapse whitespace, trim spaces and dots, guard Windows reserved
names, cap 120 characters, append `.wav` unless present, empty falls back
to the automatic name. Collisions compared case-insensitively in start
order get ` (2)`, ` (3)` and a badge. One sanitizer feeds the zip, the
folder write, and the single download.

## Testing Decisions

A good test drives the system from outside and asserts what a producer
would observe: state after keys, bytes in a file. It never reaches into
React state, wavesurfer internals, or Transport timing.

**Seam A, end to end (Playwright, real Chromium).** Fixture WAVs
generated in the test (16-bit, 24-bit, float, a file with a `JUNK`
chunk). Each test drops a fixture, replays a key script through real
`keydown`/`keyup` events, triggers an export, and asserts the zip's entry
names and that each entry's data chunk is byte-equal to the expected
slice of the fixture. Also covers: the reload restore flow with a stored
handle, the tutorial page's "do it for me" buttons producing the same
state as the keys, and that Space never scrolls. Audio output is not
asserted; Transport is exercised only for absence of errors.

**Seam B, pure core (Vitest, node).** The Core's `keyToAction` and
`reduce` driven by key-event sequences, one test per prototype
walkthrough plus the edges: Anchors cannot cross, Tab with no Regions
shakes, delete of the last Region returns to Playhead mode, undo across
mode changes, selection survives mode switches, automatic names renumber
after an insert earlier in the file. `sanitize` and `filenames` with the
rule list and collision cases (typed name equal to another's default,
`CON`, Unicode, 200-character input). `WavSource` header parsing and
`slice` on the fixture generators used by Seam A, asserting byte
equality without a browser.

No unit tests on React components, wavesurfer glue, Transport, or
IndexedDB. Prior art: the prototype's node smoke script that drives the
state machine by synthetic key events is the shape of the Seam B tests.

## Out of Scope

- MP3 or any compressed output (lamejs is LGPL). WAV only.
- Zero-crossing snap and micro-fades. Chops cut exactly at the marks.
- Split-at-Playhead and the continuous-set workflow. Regions are drawn
  and may overlap.
- Streaming decode via WebCodecs. Sixty minutes fits in memory.
- Importing `regions.json`. Export-only.
- A recents list. Only the most recent Source is offered on reload.
- Sources beyond stereo from decoded formats. WAV passthrough keeps any
  channel count; decoded multichannel is rejected with a toast.
- A sample-level detail strip. The pixel-relative fine step at maximum
  zoom is enough for v1; one-sample stepping may become a setting later.
- Silence-based auto-split.
- Firefox and Safari.

## Further Notes

- Memory: decoding a 60-minute stereo MP3 peaks near 2.9 GB in Chrome
  and settles at 0.69 GB as Int16. WAV input has no practical ceiling.
- wavesurfer's own decode is a full-rate `decodeAudioData` plus resample;
  feeding it peaks is not an optimisation but a requirement.
- Chromium caps element width, so wavesurfer zoom tops out near five
  samples per pixel on a 60-minute Source. The fine step is "one pixel"
  by design, so this is the v1 precision floor on very long files.
- The prototype in `/prototypes/` is a kept relic and primary source. Its
  first script block is the Core to port; its page is the tutorial's
  seed. Do not delete it.
- Chrome-only is a hard-to-reverse choice once file handles are stored;
  an ADR is warranted when the scaffold lands.
- Open: none. Every item the map raised has a decision above.
