# Playback engine for Playhead, preview, and hold-to-loop

Type: research
Status: resolved
Blocked by: 02

## Question

Given the pipeline from ticket 02 (Int16 in memory for decoded Sources,
byte slices for WAV), pick the playback backend for: play from Playhead
with restart-on-scrub; Region preview once or looped on key hold with
sample-accurate loop points; Anchor audition. Compare the media element
(blob URL, cheap, seek latency in the tens of ms) with Web Audio
`AudioBufferSourceNode` built per Region on demand (accurate loop, needs a
float buffer for just the Region). Ticket 03 found neither wavesurfer backend loops seamlessly and recommends
decoding only the Region slice into an `AudioBufferSourceNode` with
`loop`/`loopStart`/`loopEnd`; validate that against the pipeline from
ticket 02, including how the transport keeps the wavesurfer Playhead in
sync while Web Audio plays. Deliver a recommendation and the seam
between the "Transport" module and the UI in
`research/playback-engine.md`.

## Answer

Findings: [research/playback-engine.md](../research/playback-engine.md)
(Web Audio spec, HTML spec, Chromium media pipeline and Web Audio source,
MDN; ends with a typed `Transport` interface and six measurements for the
keymap prototype).

- **Two engines behind one Transport seam.** Playhead mode plays the
  original File through an `<audio>` element on a blob URL (file-backed,
  zero heap). Region, draft, and Anchor previews play
  `AudioBufferSourceNode`s built on demand from `Source.window(range)` at
  the Source's sample rate. Neither can do the other's job: the media
  element cannot loop without a pipeline seek and Chromium fires
  `timeupdate` only every 250 ms; Web Audio would need the whole
  60-minute Source as 1.3 GB of float.
- **Web Audio loops and stops are sample-exact** per spec and Chromium
  source: subsample-accurate loop endpoints, `stop(when)` rounded to a
  frame on the audio thread. The `(frames/rate)*rate !== frames`
  rounding nuance only switches Chromium to interpolation with an
  inaudible factor.
- **Playhead sync is pull, not push.** `Transport.position()` is a pure
  clock read (`media.currentTime`, or `ctx.currentTime - t0` minus
  `outputLatency`), consumed by the UI's single rAF loop. wavesurfer's
  own timer draws the media cursor; the overlay from ticket 03 draws the
  preview cursor. Never call `ws.setTime()` during a preview.
- **Keys map to schedule calls.** keydown (ignore `event.repeat`) starts
  a looping source about 8 ms ahead; keyup before one pass schedules
  `stop` at the pass end (frame-exact finish); keyup after a pass ramps
  gain to zero over 8 ms then stops. Space keydown counts as user
  activation, so the AudioContext can start on it. Restart-on-scrub is a
  media seek, coalesced to one per animation frame.
- **Memory.** A 60 s stereo 48 kHz Region is 22 MiB float plus an 11 MiB
  Int16 transient, both off the V8 heap. Cache one buffer per Active
  Region or draft, built on Region change rather than keydown so Space
  is instant. Cap previews near 10 minutes (230 MiB) with a media-engine
  fallback.
- **Transport interface** (all in frames): `play` / `stop`, `prepare`,
  `previewStart` / `previewRelease` / `previewOnce`, `audition`,
  `cancel`, `position()`, and `statechange` / `ended` / `error` events.
