# Waveform view: wavesurfer plus overlay

Type: task
Status: resolved
Blocked by:

## Question

Render the Source with wavesurfer 7 fed by `peaks` and `duration` (it must
never decode), saved Regions via the Regions plugin (`drag:false`,
`resize:false`, no `content`, `pointer-events:none`), and a custom
overlay for the draft band and Anchors, Active Region highlight, name
labels with "(auto)", selection marks, and the Playhead in Playhead mode
only. Zoom via `zoom` plus `setScrollTime` arithmetic centred on the
Core's focus frame; dispatch `setViewPx` on resize; mouse drag moves the
Playhead or the active Anchor by mode. Follow
`research/wavesurfer-regions-fit.md`. Leaves the app runnable with every
key visibly doing its thing, still silent.

## Answer

Done 2026-09-03, one commit. `src/view/Waveform.tsx`.

- **wavesurfer 7.12.11** (BSD-3) is the base renderer. It is fed the
  Source's 64-frame peaks level once via `loadBlob(media, peaks,
  duration)`, capped at 4M buckets, so it never decodes. Created with
  `interact:false`, `cursorWidth:0`, `hideScrollbar`, `autoScroll:false`,
  `autoCenter:false`, `fillParent:true`. It is driven from the Core's
  `view`: `zoom(width / (win / sr))` then `setScrollTime(start / sr)` on
  every view change; it never scrolls on its own.
- **Regions plugin** mirrors saved Regions by id with `drag:false`,
  `resize:false`, no `content`, `pointer-events:none`; bounds updated via
  `setOptions`, removed regions removed.
- **Overlay canvas** on top owns everything else: draft band and both
  Anchors with the active one emphasised, Active Region highlight and
  outline, labels with "(auto)", selection marks, ruler, the Playhead in
  Playhead mode only with the Return point label, and a play cursor
  coloured by kind through a `playCursor()` hook the Transport ticket
  fills in. Pointer drag on the overlay dispatches `seekTo`, which the
  Core routes to the Playhead or the active Anchor by mode; wavesurfer's
  own drag-to-seek is not used, so the plugin's drag-swallowing never
  arises.
- **Sample-exact detail:** when the view is finer than 64 frames per
  pixel the overlay fetches `Source.window` for the visible range and
  draws the raw samples (dots past 6 px per sample); wavesurfer is faded
  out rather than stretched. This also keeps wavesurfer's wrapper under
  Chromium's width cap on long Sources.
- `ResizeObserver` dispatches `setViewPx`, so `H`/`L` stay one pixel.

Not verified in a real browser this session (Chrome extension not
connected); type-check, 53 tests, and the build are green. First thing
to check by hand: drop a WAV, press `i`, `J` three times, and watch the
overlay switch to raw samples.
