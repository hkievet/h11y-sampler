# Does the wavesurfer Regions plugin fit the three-mode model?

Resolves ticket `issues/03-wavesurfer-regions-fit.md`. Researched 2026-09-02
against **wavesurfer.js 7.12.11** (npm `latest`; GitHub `main` is already
`8.0.0-beta.3`, so every line reference below is to the `7.12.11` tag, not
main). The docs at wavesurfer.xyz are TypeDoc output of the same TSDoc
comments quoted here, so the source is cited directly.

Vocabulary is `/CONTEXT.md`. The keyboard model is
`.scratch/h11y-sampler/requirements.md`.

## Recommendation

**Regions plugin for saved Regions, plus a custom overlay for everything the
three-mode model adds; do not build custom canvas regions.**

- The plugin already does the expensive, boring parts well: overlapping
  regions, percent-of-duration positioning that survives zoom and scroll for
  free, off-screen virtualisation, and `::part()` hooks for styling. Use it
  for the saved Region list, with `drag: false`, `resize: false`, no
  `content`, and `pointer-events: none` on each element.
- Everything that is specific to the mode model has no plugin counterpart and
  is cheap to draw yourself in one absolutely positioned layer: the draft
  Region with its two Anchors and the active-Anchor indicator, the Active
  Region highlight, name labels in their own lane, and a preview Playhead.
- Region and draft preview should not go through the media element at all.
  Decode only the Region's slice from the WAV bytes (which the exporter
  already parses) into an `AudioBuffer` and play it with an
  `AudioBufferSourceNode` (`loop`, `loopStart`, `loopEnd`). That gives
  sample-exact start, end and loop, no seek latency, and no 1.3 GB decode.
  Keep the default MediaElement backend for Playhead-mode transport.
- Custom canvas regions would only buy something at thousands of Regions; a
  sample-hunting session has tens. The plugin's DOM cost is one `div` per
  visible Region.

Version pinning: several techniques below touch `region.element` and the
`part` attribute, which are public fields but not documented contracts. Pin
`wavesurfer.js` to `7.12.x`; the 8.0 beta restructures `regions.ts`
(813 changed lines vs 7.12.11) although the marker/`setOptions`/
`contentEditable` behaviour read here is unchanged in that diff.

## Findings, question by question

### 1. Overlapping Regions: maps directly

The plugin stores regions in a flat array and `addRegion` pushes
unconditionally; nothing checks time ranges against each other
(`regions.ts` L561, L751-801, L804-828). The only "overlap" code,
`avoidOverlapping` (L639-680), moves **labels** (`content` divs) down with
`margin-top` so text does not collide; it never touches the region rectangles.
Overlapping rectangles simply stack in DOM order inside `regions-container`
(L619-632); with the default `rgba(0,0,0,0.1)` fill (L127) the overlap reads
as a darker band, which is a reasonable default for the "Regions may overlap"
requirement.

### 2. Single-point (one-Anchor) draft as a marker: maps, with one wrinkle

- `end` defaults to `start` (L122) and `start === end` is the marker case
  (L145, L235, L449). A marker renders with `background-color: none` and a
  `2px solid <color>` left border, gets no resize handles, and its element
  carries `part="marker <id>"` instead of `part="region <id>"` (L144-147,
  L245-263). `examples/regions.js` L50-60 documents this as "Markers
  (zero-length regions)".
- `setOptions({ start })` on a marker moves both ends (L491-498:
  `end = options.end ?? (isMarker ? start : end)`), which is exactly the
  "scrub the only Anchor" behaviour Insert Region mode needs before `o`.
- **Wrinkle:** `setOptions({ end })` turns the marker into a region in the
  model (`setPart()` flips the `part` token, L146/L496) but the inline styles
  set once in `initElement` are never revisited: `background-color` stays
  `none` and the 2px left border stays (L481-484 only react to a `color`
  option; L509-517 only add handles when `resize` changes). So a draft that
  starts as a marker and grows on `o` will look wrong unless you either
  (a) remove and re-add it, (b) pass `color` again, or (c) style by part with
  `!important`, which beats the inline style and follows the flipped token
  (`examples/styling.js` L30-47 does exactly this for `::part(region)` and
  `::part(marker)`).
- There is no notion of an "active side". Handles exist only when `resize`
  is true and are mouse affordances (`cursor: ew-resize`, L149-186). An
  active-Anchor indicator therefore has to be custom regardless.

Conclusion: the plugin *can* host the draft, but since the draft also needs
an active-Anchor indicator and per-keypress updates, drawing the draft in the
overlay (two lines plus a translucent span, positioned in percent of duration
exactly as the plugin does) is simpler than fighting the marker/region
style transition.

### 3. Programmatic highlight of one Region, no mouse: maps directly

- `region.setOptions({ color })` writes `element.style.backgroundColor`
  (L481-484); no pointer involvement, no event fired. Caveat: on a marker it
  only changes the (invisible) background, not the border colour, so it is a
  no-op for markers.
- Wavesurfer renders into an open Shadow DOM (`renderer.ts` L177-179;
  README "CSS styling"), so page CSS reaches region elements only through
  `::part()`. Tokens available: `regions-container` (L621), `region <id>` /
  `marker <id>` (L146), `region-handle region-handle-left|right`
  (L163, L177), `region-content` (L468). `#waveform ::part(<id>)` selects one
  region (`examples/styling.js` L34, `::part(region-green)`).
- A robust Active Region highlight: give Regions stable ids, then toggle a
  token with `region.element.part.add('active')` /
  `.remove('active')` and style `#waveform ::part(active)`. Note that
  `setPart()` rewrites the whole attribute whenever `start`, `end` or `id`
  change via `setOptions` (L144-147, L496, L506), so re-add the token after
  any geometry change, or use an inline `outline`/`box-shadow` on
  `region.element`, which `setOptions` never touches.
- The element may be detached from the DOM while scrolled out of view
  (`virtualAppend`, L703-749: appended only when its pixel range intersects
  `getScroll()..getScroll()+getWidth()`); inline styles and part tokens
  survive detachment, so the highlight is still correct when it scrolls back.

### 4. Zoom around an arbitrary time, and "one second either side": maps, with math

- `ws.zoom(minPxPerSec)` (`wavesurfer.ts` L619-626; throws before decode) sets
  `options.minPxPerSec` and calls `reRender()` (`renderer.ts` L721-724).
  `reRender` (L696-719) re-lays-out, then adjusts `scrollLeft` so the
  **progress edge, i.e. the Playhead cursor, keeps its screen x**. So `j`/`k`
  in Playhead mode pivot correctly with no extra work; in Insert Region mode
  (pivot on the active Anchor) you must re-scroll after `zoom()`.
- `ws.setScrollTime(t)` is `scrollLeft = scrollWidth * (t / duration)`
  (`wavesurfer.ts` L498-502, `renderer.ts` L300-304). It positions the
  **left edge** of the viewport ("Move the start of the viewing window"). To
  centre on `T`: `setScrollTime(T - visibleSeconds / 2)` with
  `visibleSeconds = ws.getWidth() / pxPerSec`, where `ws.getWidth()` is the
  scroll container's client width minus inline padding (`renderer.ts`
  L288-290). Use the true `pxPerSec = ws.getWrapper().clientWidth / duration`
  rather than the requested value; the wrapper width is
  `Math.ceil(duration * minPxPerSec)` (`renderer-utils.ts` L256).
- "One second either side" (`J`): `zoom(ws.getWidth() / 2)` then centre on
  the Playhead/Anchor. "All the way out" (`K`): `zoom(0)`; with
  `fillParent: true` (default) `minPxPerSec: 0` makes the wrapper `100%`
  and non-scrollable (`renderer-utils.ts` L256-259, `renderer.ts` L666-670).
  20% steps: `zoom(ws.options.minPxPerSec * 1.2)`; `renderer.zoom` mutates
  the same options object wavesurfer holds, so `ws.options.minPxPerSec` is
  the current level.
- Ordering: `render()` does its DOM writes synchronously (`renderer.ts`
  L633-695; `rendered` is emitted on a microtask), so `setScroll` right after
  `zoom()` is safe. The `zoom` event (L625) is what the Regions plugin
  listens to for virtualisation (`regions.ts` L729).
- **Hard ceiling on zoom for a 60-minute Source.** Wavesurfer zooms by making
  the wrapper `div` wider. Chromium layout coordinates are
  `FixedPoint<6, int32_t>` (`layout_unit.h` L473), i.e. a maximum of
  2^31 / 64 = **33,554,431 px**. One px per sample at 44.1 kHz for 60 min
  needs 158,760,000 px, so the finest reachable zoom on a 60-min file is about
  0.21 px per sample (roughly 4.7 samples per px); 1 px = 1 sample is only
  reachable for Sources up to about 12.7 min at 44.1 kHz. The `{`/`}`
  candidate ("one pixel at current zoom, reaching one sample when zoomed in")
  should not assume a 1:1 zoom exists; a fine step of one sample can still be
  offered as a fixed step independent of zoom. Verify the practical limit in
  the prototype; the number above is the layout cap, not a performance
  measurement.
- Region rectangles are positioned in percent of duration (`regions.ts`
  L268-274), so sample-level *truth* must live in the model (integer sample
  indices) and never be read back from the DOM. Also, wavesurfer's
  `getDuration()` is `media.duration`, falling back to the decoded buffer
  (`wavesurfer.ts` L659-666); take the Source duration from the WAV header
  (frame count / rate), not from wavesurfer, or every percent position is off
  by the browser's duration rounding.

### 5. Draggable Playhead: maps directly, with a plugin interaction to fix

- `dragToSeek: true | { debounceTime }` (`wavesurfer.ts` L57-60) installs a
  drag stream on the wrapper (`renderer.ts` L143-168). On each move the
  cursor is redrawn immediately and the actual seek is debounced: 200 ms by
  default when paused, 0 while playing, or your `debounceTime`
  (`wavesurfer.ts` L382-416). Events: `dragstart`, `drag`, `dragend`,
  `interaction` (L365-372, L407-408). `interact: false` /
  `toggleInteraction` disables both click-seek and drag (L337, L385, L669).
  A drag begins after a 3 px threshold (`reactive/drag-stream.ts` L54,
  L93). Near the viewport edge a drag auto-scrolls 30 px steps
  (`renderer.ts` L732-740). Use `dragToSeek: { debounceTime: 0 }`.
- **Regions swallow drags that start over them.** Every region element has
  `pointer-events: all` (L256) and its own drag stream (L318), independent of
  the `drag` option; `drag: false` only makes `onMove` a no-op (L379-382).
  Both the region's and the wrapper's document-level `pointermove` listeners
  run, the region's first (registered first, it is the inner element); it
  calls `preventDefault()` past the threshold (`drag-stream.ts` L93-95) and
  the wrapper's handler bails on `event.defaultPrevented` (L82). Clicks still
  bubble to the wrapper's click-seek (`renderer.ts` L104). With overlapping
  Regions covering much of the waveform this would make the Playhead
  un-draggable over them. Fix: set `region.element.style.pointerEvents =
  'none'` after `addRegion` (this is a reading of the code; confirm in the
  prototype). This also fits "everything else is keyboard".
- Scrubbing during playback: `ws.setTime()` clears `stopAtPosition`
  (`wavesurfer.ts` L673-679), and on the WebAudio backend the scheduled stop
  belongs to the node that a seek replaces (`webaudio.ts` L212-233,
  L259-268), so any Region preview with an end must be re-issued after a
  scrub. In Playhead mode this is the desired "restart from the new position"
  behaviour.

### 6. Media-element seek vs Web Audio for sample-accurate looped preview

**Media element (default backend):**
- `setTime` assigns `media.currentTime` (`player.ts` L272-274). Per the HTML
  seek algorithm the script continues immediately; the user agent then, in
  parallel, "wait[s] until ... it has decoded enough data to play back that
  position" before firing `seeked`. Latency is unspecified and varies.
- Region end is enforced by polling: a `requestAnimationFrame` timer
  (`timer.ts` L11-29) checks `currentTime >= stopAtPosition`, then
  `pause()` and snaps back with `setTime(stopAt)` (`wavesurfer.ts` L258-277).
  Playback overshoots the end by up to a frame before being clamped.
- `region-in` / `region-out` derive from the same `timeupdate` polling
  (`regions.ts` L589-616). The documented loop idiom is `region.play()` on
  `region-out` (`examples/regions.js` L112-121), so each loop pass costs an
  overshoot plus a seek plus a `play()` promise: audibly not seamless.
  Verdict: fine for Playhead-mode transport, **not** for sample-level Region
  preview.

**WebAudio backend (`backend: 'WebAudio'`, `wavesurfer.ts` L87, L196-198):**
- `WebAudioPlayer` plays an `AudioBufferSourceNode`. Seeking restarts the
  node at the new offset on the audio clock (`webaudio.ts` L259-268 ->
  L152-184, `bufferNode.start(ctx.currentTime, pos)`), and
  `play(start, end)` schedules `bufferNode.stop(ctx.currentTime + delay)`
  (`wavesurfer.ts` L694-697, `webaudio.ts` L212-233). The Web Audio spec
  says `start`/`stop` "schedule ... at an exact time" and the buffer playback
  algorithm handles the start offset and loop points "with sub-sample
  precision". So a **single pass** is sample-exact.
- But looping is still JS-driven: `ended` -> `pause()` -> your next `play()`
  (L218-232). There is no exposure of `loop` / `loopStart` / `loopEnd`. The
  gap between passes is event latency, not zero.
- Cost: the backend decodes the whole Source with `decodeAudioData`
  (L125-150). For 60 min of stereo at 44.1 kHz that is
  3600 x 44100 x 2 x 4 B = **1.27 GB** of float32, and the spec requires the
  result be "resample[d] ... to the sample-rate of the BaseAudioContext" when
  it differs, so on a 48 kHz device the decoded sample indices no longer
  line up with the file. Wavesurfer separately decodes the file again for
  peaks at `options.sampleRate` (default **8000 Hz**, `wavesurfer.ts` L69,
  L104; `decoder.ts` L2-3), which is why `ws.getDecodedData()` must never be
  used for audio or export.

**What to do instead:** the exporter already reads PCM frames straight from
the WAV bytes. Reuse that to build a small `AudioBuffer` for just the Region
(or draft) at the Source's own rate (`new AudioContext({ sampleRate })`,
or an `OfflineAudioContext`) and play it through an `AudioBufferSourceNode`
with `loop = true`, `loopStart`, `loopEnd`. Start, end and loop are then
sample-exact by spec, there is no seek, and memory is the Region's length,
not the Source's. Drive a preview Playhead in the overlay from
`audioContext.currentTime` via rAF; do not call `ws.setTime()` during
preview, because that seeks the media element. This is the "confirm in
prototype" item for Space in Insert Region mode and Space-hold in Region
Select mode. Keep the MediaElement backend for Playhead-mode `Space`, where
seek latency is acceptable and streaming a 60-min Blob is cheap.

### 7. `content` / `contentEditable` for names: avoid

- A string `content` becomes a `div` set via `textContent` (safe), styled
  `inline-block` with padding (L448-456). `getContent()` returns
  `innerHTML` (L419-427), so it is not a faithful round-trip for names
  containing `&`, `<`, etc.; keep the name in the model and only push it
  down.
- `contentEditable: true` sets the attribute and wires **click** (focus,
  `stopPropagation`) and **blur** (emit `update-end`, which the plugin
  re-emits as `region-updated`, indistinguishable from a drag/resize end)
  (L339-344, L397-406, L460-467, L766-769). There is no input/commit event:
  `region-content-changed` fires only from `setContent` (L470), not from
  typing. Entering edit is mouse-first; keyboard entry means focusing the
  content div yourself.
- Typing inside a `contentEditable` in the shadow tree emits composed key
  events; the app's global key handler would see `h`, `l`, `s`, `[` as mode
  keys unless it inspects `composedPath()`. Labels are also repositioned on a
  10 ms timeout to dodge each other (L642-679) and detached when scrolled out
  of view (L703-721), so an in-progress edit can lose focus.
- The requirement ("name prompt with the default name highlighted so typing
  replaces it; Enter commits; Esc discards prompt and draft") is an ordinary
  text input in the app, not an in-waveform editor.

Conclusion: do not use `contentEditable`. Use `content` at most as a
read-only string label, or, better, render labels in the overlay's own lane
so they are fully styleable without `::part`/`!important` and never collide
with the waveform.

## Notes for the overlay

- Append the overlay to `ws.getWrapper()` (the plugin does the same,
  `regions.ts` L580) so it scrolls and zooms with the waveform; position
  children as `left: start / duration * 100%`. Because the wrapper is inside
  the shadow root, style it with an injected `<style>` on
  `ws.getWrapper().getRootNode()` or inline styles; a React portal into the
  wrapper works since `createPortal` accepts any node. The alternative, a
  sibling layer outside wavesurfer translated by `-ws.getScroll()` on every
  `scroll` event (`wavesurfer.ts` L146-147, L349-353), is more sync work for
  no gain.
- Wavesurfer's own cursor is `part="cursor"` and can be styled from the page
  (`examples/styling.js` L14-28). The Return point can be a second thin line
  in the overlay.
- `regions.getRegions()` returns the live internal array (L634-637); copy
  before iterating destructively. Use `region.remove()` to delete; 7.12.1
  and 7.12.11 fixed leaks on removal (release notes).
- `setOptions({ start, end })` clamps to `[0, duration]` (L140-142,
  L493-494) but does not enforce `start <= end`; "Anchors cannot cross" is
  the app's rule, enforced in the model before calling the plugin.

## Sources

- npm registry `wavesurfer.js` dist-tags (latest `7.12.11`, beta
  `8.0.0-beta.3`), fetched 2026-09-02.
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/plugins/regions.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/wavesurfer.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/renderer.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/renderer-utils.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/player.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/webaudio.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/timer.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/decoder.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/reactive/drag-stream.ts
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/examples/regions.js
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/examples/styling.js
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/examples/zoom.js
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/examples/webaudio-shim.js
- https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/README.md ("CSS styling", FAQ)
- GitHub releases 7.11.0 to 7.12.11 (regions fixes: #4258, #4270, #4274, #4291, #4322, #4339)
- https://wavesurfer.xyz/docs/ (TypeDoc of the above; no additional claims)
- HTML Standard, media elements, seek algorithm and `timeupdate` cadence:
  https://html.spec.whatwg.org/multipage/media.html
- Web Audio API, `AudioBufferSourceNode.start/stop`, buffer playback
  algorithm ("sub-sample precision"), `decodeAudioData` resampling:
  https://webaudio.github.io/web-audio-api/
- Chromium `LayoutUnit = FixedPoint<6, int32_t>`:
  https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/geometry/layout_unit.h
