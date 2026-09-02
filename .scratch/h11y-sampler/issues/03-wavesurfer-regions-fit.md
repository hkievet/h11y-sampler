# Does the wavesurfer Regions plugin fit the three-mode model?

Type: research
Status: resolved
Blocked by:

## Question

The UI needs: overlapping Regions; a draft Region with only one Anchor
(rendered as a marker until `o` places the other); a keyboard-driven
Active Region highlight with no mouse; an active-Anchor indicator; zoom
around an arbitrary time (Playhead or Anchor) at 20% steps plus a
"one second either side" preset; a draggable Playhead; and region
playback that restarts on scrub. Against wavesurfer 7.12 and its Regions
plugin: which of these map directly (single-point regions as markers,
`setOptions`, `zoom`, `setScrollTime`), which need a custom overlay, and
whether region `content`/`contentEditable` should be avoided for names.
Also: does the media-element backend seek fast enough for sample-level
loop preview, or does Region preview need Web Audio? Deliver findings in
`research/wavesurfer-regions-fit.md` with a recommendation: plugin,
plugin plus overlay, or custom canvas regions.

## Answer

Findings: [research/wavesurfer-regions-fit.md](../research/wavesurfer-regions-fit.md)
(every claim cited to file:line at the wavesurfer `7.12.11` tag or to the
HTML / Web Audio specs).

- **Recommendation: Regions plugin plus a custom overlay.** Plugin for
  saved Regions (overlap, percent positioning, virtualisation, `::part()`
  styling map directly) created with `drag:false`, `resize:false`, no
  `content`, and `pointer-events:none`. The overlay draws the draft
  Region, both Anchors, the active-Anchor indicator, the Active Region
  highlight, name labels, and a preview Playhead. Custom canvas regions
  are not justified at sample-hunting Region counts.
- **Markers work with edges:** `end` defaults to `start` and renders a
  marker, and `setOptions({start})` moves it, but promoting a marker to a
  region via `setOptions({end})` leaves stale inline styles. Draw the
  draft in the overlay instead. Highlight via `setOptions({color})` or a
  `part` token; note `setPart()` rewrites the attribute on geometry
  changes.
- **Zoom and scroll are arithmetic:** `zoom()` pivots on the cursor;
  `setScrollTime()` sets the left edge, so centre on T with
  `T - getWidth()/pxPerSec/2`; "one second either side" is
  `zoom(getWidth()/2)`.
- **Hard limit:** Chromium `LayoutUnit` caps element width at
  33,554,431 px, so 1 px per sample is unreachable for a 60-minute
  Source (about 0.21 px per sample at best). The fine `{` / `}` step
  cannot assume a 1:1 zoom; it needs an explicit one-sample step.
- **Draggable Playhead maps** via `dragToSeek:{debounceTime:0}`, but
  region elements swallow drags that start over them even with
  `drag:false`; set `pointer-events:none` on region elements. Any scrub
  cancels a scheduled region end on both backends.
- **Neither wavesurfer backend gives seamless loop preview.** The media
  element polls ends with rAF and seeks async; the WebAudio backend is
  sample-exact per pass but loops via JS `ended` events and would hold
  about 1.27 GB for a 60-minute stereo Source. Decode only the Region
  slice into an `AudioBufferSourceNode` with `loop`/`loopStart`/`loopEnd`
  for preview (feeds ticket 08).
- **Avoid `contentEditable` for names:** mouse-first, no commit event,
  blur is overloaded with `region-updated`, and key events leak into mode
  handlers. Names live in the app's own prompt.
- `getDecodedData()` returns the 8 kHz peaks decode, never audio.
