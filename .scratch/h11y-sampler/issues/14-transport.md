# Transport: media element and Web Audio previews

Type: task
Status: open
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
