# h11y-sampler map

Label: wayfinder:map

## Destination

A working h11y-sampler, hosted as static files: drop a Source, mark and
name overlapping Regions in the three modes of the final keymap, leave
with a zip of WAV Chops named exactly what was typed, with the tutorial
page built in. The map is done when the app does what
`requirements.md` says and is deployed.

(Redrawn 2026-09-02 at the user's request. The original destination, a
spec with nothing left to decide, was reached: see the decisions below.)

## Notes

- The spec: [spec.md](./spec.md). Vocabulary: `/CONTEXT.md`. Settled requirements and the final keymap:
  [requirements.md](./requirements.md). Tickets refine edges; they do not
  redraw what is settled there.
- Skills: grilling + domain-modeling for decision tickets; prototype for
  the keymap ticket; research for AFK tickets. Research findings go in
  `.scratch/h11y-sampler/research/<slug>.md` (no git repo, so no research
  branches).
- **Execution override:** this map carries the build. Tickets from here on
  are `task` slices sized to one session, each leaving the app runnable.
  Build from the spec, `requirements.md`, `CONTEXT.md`, and the research
  docs; port the state machine from `/prototypes/keymap-prototype.html`
  rather than rewriting it.
- The prototype is kept in `/prototypes/` as a primary source and as the
  seed of the tutorial page. Do not delete it.
- Standing preferences: vim keybindings wherever they fit, mouse optional
  after the drop, Chrome-only APIs allowed when they are more robust,
  permissive licenses only (BSD/MIT-class; LGPL does not qualify).
- Chrome on macOS owns some Cmd combinations; check every modifier chord
  against the reserved list in the Chrome-reserved shortcuts decision.

## Decisions so far

<!-- one line per closed ticket: gist, then link -->

- [Chrome-reserved shortcuts on macOS](./issues/01-chrome-reserved-shortcuts.md): coarse scrub is Option+bracket matched on `event.code`; export is Cmd+E (or Cmd+Enter); Cmd+Shift+bracket, Cmd+W/T/N/Q, Ctrl+Tab are unreachable; `u`/Ctrl+R plus Cmd+Z/Cmd+Shift+Z for undo/redo.
- [Does the wavesurfer Regions plugin fit the three-mode model?](./issues/03-wavesurfer-regions-fit.md): plugin for saved Regions (no drag, no content, pointer-events none) plus a custom overlay for draft, Anchors, highlight and labels; Region preview via a per-Region `AudioBufferSourceNode`, not wavesurfer playback; Chromium's width cap means the fine step must be an explicit one-sample step, not pixel-relative.
- [Decode and memory pipeline for a 60-minute Source](./issues/02-decode-and-memory-pipeline.md): WAV Chops are header plus a heap-free File slice with the `fmt ` chunk copied verbatim; compressed Sources peak near 2.9 GB during decode and settle at 0.69 GB Int16; wavesurfer must be fed precomputed peaks; frames are the unit of truth; a `Source` interface (`peaks`, `window`, `slice`, `media`) with no UI imports.
- [Playback engine for Playhead, preview, and hold-to-loop](./issues/08-playback-engine.md): two engines behind one Transport seam, a media element for Playhead-mode play and per-Region Web Audio buffers for sample-exact previews; Playhead position is pulled from a clock in one rAF loop; keydown/keyup map to scheduled start/stop with an 8 ms gain ramp; preview buffers are built on Region change and capped near 10 minutes.
- [Region Select mode: ordering, mutations, Selected Regions, batch export](./issues/04-region-select-keys-and-batch-export.md): start-time order; Tab activates the Region nearest the Playhead; `x` delete, `r` rename, `u`/Ctrl+R undo/redo; `Shift+Space` toggles selection, `A` all, `Shift+A` clear, set survives mode switches; `Cmd+E` zips Selected or all and clears the set; no export of unsaved drafts.
- [Boundary quality for sample-level cuts](./issues/05-boundary-quality.md): `a` auditions the active Anchor directionally (start plays forward, end plays into the cut); micro-fades ruled out. The zero-crossing snap decided here was later removed by the keymap prototype.
- [Reload, persistence, and which Chrome-only APIs to lean on](./issues/06-reload-and-persistence.md): file handle in IndexedDB gives a one-keypress full restore on reload, fingerprint-keyed Regions as fallback; `Cmd+Shift+E` writes Chops into a remembered folder, `E` stays on Downloads; autosave every undo step, twenty recent Sources; `regions.json` rides in every zip, export-only.
- [Filename sanitization and collision rules](./issues/07-filename-rules.md): NFC, keep Unicode, illegal characters to `_`, trim spaces and dots, guard Windows reserved names, 120-char cap, `.wav` appended, empty falls back to the default; case-insensitive collisions get ` (2)` with a badge, never block or overwrite; sanitized name previewed live in the prompt; one sanitizer for zip, folder and `E`.
- [Keymap prototype: feel the three modes before speccing them](./issues/09-keymap-prototype.md): the final keymap table, verified by hand; snap removed, whole ladder zoom-relative, `i`/`I` place both Anchors, `J`/`K` are 80% zoom steps, Playhead hidden outside Playhead mode and never moved by Region Select, `S` saves-and-exports, `a`/`A` audition around the Playhead, coloured play cursors, and a tutorial page modelled on the prototype walkthroughs.
- [Write the spec](./issues/10-write-the-spec.md): `spec.md` is the build's source of truth; two test seams, Playwright end to end and Vitest on the pure core.
- [Scaffold the app and port the state machine](./issues/11-scaffold-and-port-the-state-machine.md): git repo with two commits; Vite 6 + React 18 + TS + Vitest 3; the Core in `src/core/chopper.ts` with 33 tests and a `Driver` key-replay helper; placeholder Shell on a silent stand-in Source.
- [Source module: WAV fast path, decoded path, peaks](./issues/12-source-module.md): `openSource` sniffs bytes; WAV Chops are a verbatim-`fmt ` header plus a `File.slice`; decoded Sources sniff the container rate, decode once, and hold Int16; a 64-frame peaks level serves every zoom; 20 tests on generated fixtures; the drop zone is live.
- [Waveform view: wavesurfer plus overlay](./issues/13-waveform-view.md): wavesurfer fed the peaks level once and driven from the Core's view; Regions plugin mirrors saved Regions with pointer-events off; a canvas overlay draws draft, Anchors, highlight, labels, Playhead, ruler, and play cursor, handles drag, and draws raw samples below 64 frames per pixel.
- [Transport: media element and Web Audio previews](./issues/14-transport.md): an `<audio>` on the original file for Playhead play with restart-on-scrub; per-range Web Audio buffers at the Source rate for looping previews with the finish-the-pass and 8 ms ramp release rules, auditions, and export playback; `position()` pulled by the overlay; the Shell maps play intents to it and feeds `playbackEnded` back.
- [Export: single WAV, zip, folder write](./issues/15-export.md): one sanitizer, three sinks; JSZip `STORE` with `regions.json`; `Cmd+Shift+E` writes to a folder via the File System Access API; `notify` action for toasts; zip contents tested byte-exact in node.
- [Persistence: reload restore and autosave](./issues/16-persistence.md): hand-rolled IndexedDB store; session per fingerprint with the file handle, regions, selection, playhead, view; twenty recent; "Press Enter to reopen" on the drop zone; restore on mount with a same-name fallback and warning; autosave 200 ms after changes; folder handle and settings persisted.
- [Tutorial page and keymap reference](./issues/17-tutorial-page.md): six walkthroughs with "Do it for me" buttons replaying real key events, the keymap reference, `?` to toggle, and a synthesized demo recording offered on the drop zone so the tutorial works with no file.

## Not yet specified

Nothing. The build is fully sliced into tickets 12 to 18.

## Out of scope

- Importing a `regions.json` to rebuild a session from a zip. Export-only
  was decided in
  [Reload, persistence, and which Chrome-only APIs to lean on](./issues/06-reload-and-persistence.md).
- A recents list of past Sources. Only the most recent is offered.
- Zero-crossing snap at export. Removed by the keymap prototype as confusing.
- Sources beyond stereo from decoded formats. WAV passthrough keeps any channel count; decoded multichannel is rejected in v1.
- A sample-level detail strip. The pixel-relative fine step at maximum zoom is enough for v1; one-sample stepping can be a later setting.

- MP3 or any compressed output. lamejs is LGPL, which fails the license
  constraint; WAV-only is the decision. Revisit only via WebCodecs
  Opus/AAC as a fresh effort.
- Split-at-Playhead and the continuous-set chopping workflow. Regions
  overlap and are drawn, never split.
- Streaming decode via WebCodecs. Sixty minutes fits in memory.
- Micro-fades at Chop edges. They alter the audio and zero-crossing snap
  already removes clicks; ruled out in
  [Boundary quality for sample-level cuts](./issues/05-boundary-quality.md).
