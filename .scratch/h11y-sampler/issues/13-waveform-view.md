# Waveform view: wavesurfer plus overlay

Type: task
Status: claimed
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
