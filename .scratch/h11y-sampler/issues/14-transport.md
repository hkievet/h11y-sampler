# Transport: media element and Web Audio previews

Type: task
Status: resolved
Blocked by:

## Question

Build Transport from the spec and `research/playback-engine.md`: media
element over a blob URL of `media()` for Playhead-mode play with
restart-on-scrub coalesced per animation frame; per-range
`AudioBufferSourceNode`s from `window(range)` for draft and Region
previews (tap once, hold loops, release rules, 8 ms lead and ramp, 200 ms
tap rule, buffers built on Region change, ten-minute cap) and for
auditions (`a`/`A` around the Playhead, `a` on the active Anchor,
directional). `position()` pulled by the Shell's single animation frame
loop; coloured play cursor (white, green, blue, amber) drawn by the
overlay. Leaves the app runnable and audible.

## Answer

Done 2026-09-03, one commit. `src/transport/transport.ts`, no React, no
wavesurfer, frames throughout.

- **Media engine:** an `<audio>` on a blob URL of `Source.media()`.
  `play(frame)` seeks and plays; calling it again while playing is the
  restart-on-scrub. `ended` on the element reports source-end.
- **Buffer engine:** an `AudioContext` at the Source's sample rate,
  created on first use (Space keydown is a user activation). Buffers are
  built from `Source.window(range)` as float and cached (eight most
  recent), primed by `prepare` when the Active Region or draft changes so
  Space is instant. `previewStart` loops with `loopStart`/`loopEnd`;
  `previewRelease` finishes the current pass with a frame-exact `stop`
  when the first pass is incomplete (this covers the sub-200 ms tap), else
  ramps gain to zero over 8 ms and stops. `once(range, kind)` plays
  auditions and export playback with a scheduled stop. 8 ms scheduling
  lead. Ranges over ten minutes are refused silently (fog: a toast).
- **`position()` / `cursorKind()`** are pure clock reads: media
  `currentTime`, or `ctx.currentTime - t0` modulo the pass length for
  loops. The overlay's animation loop draws the cursor coloured by kind.
- **Shell wiring:** one effect on `playSeq` maps the Core's `play` intent
  to `play`, `previewStart`/`previewRelease`, `once`, or `cancel`;
  `onEnded` dispatches `playbackEnded`.

Not verified by ear this session (Chrome extension not connected); the
prototype exercised the same schedule rules audibly. First things to
check by hand: Space in Playhead mode restarts on `l`; hold Space on a
Region and release mid-pass hears the pass complete; `a` on an end
Anchor stops dead on it.
