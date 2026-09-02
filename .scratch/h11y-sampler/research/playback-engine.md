# Playback engine: a Transport for Playhead, preview, and hold-to-loop

Resolves ticket `issues/08-playback-engine.md`. Date: 2026-09-02. Target:
Chrome on macOS, Sources up to 60 minutes, Regions typically seconds to a
minute. Vocabulary is `/CONTEXT.md`; the keyboard model is
`.scratch/h11y-sampler/requirements.md`; the `Source` interface (frames,
`peaks`/`window`/`slice`/`media`) is `research/decode-and-memory-pipeline.md`;
the reasons wavesurfer's own backends cannot loop seamlessly are
`research/wavesurfer-regions-fit.md`.

Sources were read directly: the Web Audio API spec (editor's draft), the HTML
Standard (media elements, user activation), Chromium `main` via
chromium.googlesource.com (Blink `HTMLMediaElement`, `WebMediaPlayerImpl`,
`PipelineController`, `AudioRendererImpl`, `AudioRendererAlgorithm`, Blink
Web Audio handlers, `AudioContext`, `AudioDestination`, `AudioManagerMac`,
`AudioLatency`, media `limits.h`), Chromium's FFmpeg config and `wavdec.c`,
wavesurfer.js `7.12.11` source, and MDN. Anything not traceable to one of
those is marked **recommendation**.

## Summary

1. **Two engines behind one seam.** Playhead-mode transport runs on an
   `<audio>` element fed a blob URL of `Source.media()`; Region, draft, and
   Anchor auditions run on Web Audio `AudioBufferSourceNode`s built on
   demand from `Source.window(range)`. A single `Transport` module owns
   both, guarantees only one is audible at a time, and speaks to the UI in
   frames. There is no "one backend" that satisfies both needs: the media
   element cannot loop without a seek and cannot stop on a sample; Web
   Audio cannot play a 60-minute Source without either a 1.3 GB float
   buffer or a hand-written streaming worklet.
2. **Web Audio looping is sample-exact by spec and in Chromium.** Loop
   endpoints "have subsample accuracy", the looped playback "should behave
   identically to an unlooped buffer containing consecutive occurrences of
   the looped audio", and `stop(when)` is honoured to a sample frame
   (Chromium rounds the stop time up to a frame within the render quantum).
   Chromium takes a memcpy fast path when the loop points land on integer
   frames; when they do not (which happens for ~13% of frame counts because
   `(f / rate) * rate !== f` in doubles) it linearly interpolates with a
   factor of ~1e-10, which is inaudible.
3. **The media element is fine for Playhead-mode and nothing else.** A seek
   is a pipeline flush, a demuxer seek, and a preroll until the audio
   renderer's queue is "adequate for playback"; the `seeked` event and the
   resumed audio arrive tens of milliseconds later. `currentTime` returns
   the seek target synchronously during a seek, so the visual Playhead can
   be exact even though the audio is not. Chromium fires `timeupdate` every
   250 ms (the slowest the spec allows), so any Playhead animation must
   poll `currentTime` from `requestAnimationFrame`, which wavesurfer already
   does.
4. **The Playhead stays in sync by reading clocks, not by pushing time.**
   `Transport.position()` is a pure function of `media.currentTime` (media
   engine) or `ctx.currentTime - t0` (buffer engine). The UI's rAF loop
   asks for it and draws: wavesurfer's own cursor for Playhead mode
   (wavesurfer's timer does this already), the overlay preview Playhead
   from ticket 03 for previews. `ws.setTime()` is never called while a
   buffer preview plays, because it seeks the media element.
5. **Keydown/keyup drive the loop without clicks** by scheduling on the
   audio clock: keydown `start(t0)` with `loop = true`; keyup before one
   pass completes `stop(t0 + passSeconds)` (the pass finishes, exact to the
   frame); keyup after a full pass ramps a `GainNode` to 0 over ~8 ms and
   `stop()`s at the end of the ramp. Auto-repeat keydowns are ignored via
   `KeyboardEvent.repeat`.
6. **A 60-second Region costs 22 MiB of float (48 kHz stereo)** plus an
   11 MiB Int16 transient from `Source.window`, both off the V8 heap.
   Cache the last built Region buffer; cap buffer previews at about 10
   minutes (230 MiB) and fall back to the media engine above that.

## 1. Two candidates against primary sources

### 1.1 Media element on a blob URL

**What a seek does.** `HTMLMediaElement::setCurrentTime` calls `Seek(time)`,
which sets `seeking_`, records `last_seek_time_`, queues `seeking`, and calls
`web_media_player_->Seek(time)`; steps 14-17 (clear `seeking`, `timeupdate`,
`seeked`) run "when the engine signals a readystate change or otherwise
satisfies seek completion" [hme]. `WebMediaPlayerImpl::DoSeek` drops the
ready state to `HaveMetadata`, sets `seeking_ = true`, and calls
`pipeline_controller_->Seek(time, ...)` [wmpi]. The one shortcut: "When
paused or ended, we know exactly what the current time is and can elide seeks
to it" (`seeking_to_same_paused_time`), which never applies while playing
[wmpi]. `PipelineController::Seek` records `pending_seek_time_` and
dispatches; a second seek arriving while one is in flight overwrites the
pending time, so a burst of scrubs collapses to the last one, but each
completed seek still costs a full flush and preroll [pc]. The HTML seek
algorithm says the same in spec terms: a new seek "abort[s] that other
instance of the algorithm", then the UA must "wait until ... it has decoded
enough data to play back that position" before `seeked` [html-seek].

**How long the preroll is.** After a flush the audio renderer reports
`BUFFERING_HAVE_ENOUGH` only when `algorithm_->IsQueueAdequateForPlayback()`
[ari], which is `audio_buffer_.frames() >= playback_threshold_`; the
threshold starts at `max(2 * frames_per_buffer, starting_capacity)` where
`starting_capacity` is a field-trial parameter [ara]. For a local PCM WAV
behind a blob URL the demuxer seek is a byte-offset computation and the
"decode" is a copy, so the bound is the pipeline's thread hops and the
threshold, not I/O. No primary source states a number; the ticket's "tens of
milliseconds" is consistent with the structure above and should be measured
in the prototype rather than assumed.

**What `currentTime` returns.** During a seek it returns `last_seek_time_`
("currentTime() also returns last_seek_time_ when seeking_ is true") [hme].
Otherwise it returns the "official playback position", which Chromium
refreshes from the player at most once per task: `SetOfficialPlaybackPosition`
clears a flag and re-arms it on a microtask, so a value read twice in one
event handler is stable and a value read in the next rAF is fresh [hme]. The
player's time is `AudioRendererImpl::CurrentMediaTime()`, an `AudioClock`
front timestamp advanced by wall clock since the last render callback, which
already accounts for frames still in the hardware buffer [ari]. So
`media.currentTime` polled from rAF is a smooth, latency-compensated estimate
of what is audible, to within a hardware buffer. That is exactly what a
Playhead cursor needs.

**How often `timeupdate` fires.** The spec bounds periodic `timeupdate` to
"every 15 to 250ms" ("not to be fired faster than about 66Hz or slower than
4Hz") [html-tmo]; Chromium picks "the slowest frequency",
`kMaxTimeupdateEventFrequency = base::Milliseconds(250)` [hme]. Any UI that
animates on `timeupdate` alone runs at 4 Hz. wavesurfer knows this: its
`Timer` is a `requestAnimationFrame` loop started on `play` and stopped on
`pause`, and every tick calls `renderProgress(currentTime / duration)` and
emits `timeupdate`/`audioprocess` [ws-timer], [ws-main L258-276].

**Format coverage.** Chromium's FFmpeg build (mac/x64 config) enables
`CONFIG_WAV_DEMUXER`, `PCM_S16LE`, `PCM_S24LE`, `PCM_S32LE`, `PCM_F32LE`, and
`PCM_U8` decoders, and not `PCM_F64LE` [ffcfg]; the WAV demuxer parses `RF64`
and `ds64` [wavdec]. So every WAV the Source module accepts (section 1 of the
decode doc) plays in the element except 64-bit float, which should fall
through to the decoded path anyway. A blob URL over the dropped `File` is
file-backed (decode doc section 1), so playback streams from disk and holds
nothing on the heap.

**Verdict.** Ideal for "play from here for as long as I like" over a
60-minute file: zero memory, correct clock, wavesurfer integration for free.
Unusable for loops (every wrap is a seek plus a `play()` promise, ticket 03
section 6) and for stopping on a sample (the end is enforced by rAF polling
with up to a frame of overshoot, `wavesurfer.ts` L267-273).

### 1.2 Web Audio `AudioBufferSourceNode`

**Start.** `start(when, offset, duration)`: "If 0 is passed in for this value
or if the value is less than currentTime, then the sound will start playing
immediately" [wa-start]. Chromium sets `start_time_ = max(when,
currentTime())` on the main thread, and on the audio thread computes
`start_frame = TimeToSampleFrame(start_time_, rate, kRoundUp)` and begins at
that frame inside the render quantum (`quantum_frame_offset`), zeroing the
frames before it [assh]. A late start (control message arrives after the
scheduled frame) simply begins at the next quantum boundary; the
`start_frame_offset` adjustment is the sub-frame rounding residue, not a skip.
With `playbackRate == 1` and `detune == 0` the start offset is snapped to a
whole frame ("at playbackRate == 1 we don't want to go through linear
interpolation at a sub-sample position since it will degrade the quality"),
so playback "will be identical to the PCM data stored in the buffer" [absh].
`TimeToSampleFrame` rounds through a 1024x oversampled grid to defeat
`Fs * (k / Fs) != k` [autil].

**Loop.** Spec: "The body of the loop is considered to occupy a region from
loopStart up to, but not including, loopEnd"; "Loop endpoints have subsample
accuracy"; "The playback of a looped buffer should behave identically to an
unlooped buffer containing consecutive occurrences of the looped audio
content"; "Loop-related properties may be varied during playback of the
buffer, and in general take effect on the next rendering quantum" [wa-loop].
`loopEnd` of 0 (the default) "is equivalent to the length of the buffer"
[wa-loop]. Chromium: `virtual_start_frame = effective_loop_start_ * rate`,
`virtual_end_frame = effective_loop_end_ * rate`; when
`computed_playback_rate == 1` and both the read index and the loop points are
integral it takes `ProcessFastPath`, a per-channel `copy_from` up to the loop
end and a modulo wrap; otherwise `ProcessInterpolatedPath` linearly
interpolates and, at the wrap, interpolates between the last loop frame and
the first ("the next sample for interpolation is the start of the loop")
[absh]. `SetLoop` takes the process lock and updates the effective points, so
flipping `loop` off mid-pass makes the current pass run to the buffer end and
finish [absh].

The fast-path condition is not guaranteed: in IEEE-754 doubles
`(f / rate) * rate !== f` for about 13% of integer `f` up to 172.8M at both
44.1 and 48 kHz (sampled every 997th frame in Node 22). That only selects the
interpolated path with an interpolation factor of order 1e-10, i.e. the
output equals the sample to float precision. It is a CPU nuance, not an
accuracy one, and applies equally to `loopEnd = 0` because
`buffer.duration = length / sampleRate` is the same division.

**Stop and `ended`.** `stop(when)`: the source stops at `when`, or
immediately if `when` is in the past [wa-stop]. Chromium rounds the end time
up to a frame ("the end frame is the end time rounded up because it is an
exclusive upper bound"), zeroes the rest of the quantum, and posts `ended` to
the main thread [assh]. So `stop(t)` is exact to the frame on the audio
thread; only the *notification* is asynchronous. The spec: "the ended event is
dispatched when the stop time determined by stop() is reached" [wa-ended].

**Clock and latency.** `currentTime` "is the time in seconds of the sample
frame immediately following the last sample-frame in the block of audio most
recently processed" and "is updated by the rendering thread in uniform
increments, corresponding to one render quantum" (128 frames by default)
[wa-ct]. `baseLatency` is the processing latency from the destination to the
audio subsystem; Chromium computes it as `max(framesPerBuffer,
renderQuantumSize) / sampleRate` [ac]. On macOS Chromium's output buffer
defaults to `2 * kMinAudioBufferSize = 256` frames for rates under 96 kHz
[amm], [limits], so `baseLatency` is 5.8 ms at 44.1 kHz / 5.3 ms at 48 kHz.
`outputLatency` is "the interval between the time the UA requests the host
system to play a buffer and the time at which the first sample in the buffer
is actually processed by the audio output device" and "may change while the
context is running" [wa-ol]; Chromium reports it rounded to 8 ms unless the
page holds microphone permission, in which case to 1 ms [ac]. Its
intent-to-ship targeted Chrome 98 [i2s-ol]; it is present in every current
Chrome. `getOutputTimestamp()` pairs the context time "currently
being rendered by the audio output device" with a `performance.now()` time
[wa-ots]; Chromium clamps it to never exceed `currentTime` [ac].

Keydown-to-sound for a buffer preview is therefore: main-thread dispatch, one
render quantum (2.7 ms at 48 kHz), `baseLatency` (~5 ms), and
`outputLatency` (device dependent, typically 10-20 ms on built-in macOS
output). No seek, no preroll.

**Context sample rate.** `AudioContextOptions.sampleRate`: "If sampleRate is
not specified, the preferred sample rate of the output device for this
AudioContext is used" [wa-opts]. Chromium's `AudioDestination` resamples the
graph output to the device rate when they differ ("resampling from X Hz to
Y Hz") with a `SincResampler`, which adds a small latency floor [ad]. So a
context created at the Source rate plays Region buffers whose frame indices
are Source frames, with the resampling done once at the output, not by
rewriting the buffer. This is the same choice the decode doc makes for
`decodeAudioData`.

**Autoplay.** Chrome's policy suspends an `AudioContext` created before a
user gesture and requires `resume()` after one [autoplay]. The HTML Standard
lists `keydown` (other than Esc or a UA-reserved shortcut) as an "activation
triggering input event" [html-act]. Space in any mode is therefore a valid
activation; the Chrome blog's "stick to click" caution predates that spec
text, so the prototype should confirm `ctx.state === 'running'` after the
first Space and call `resume()` defensively.

**Gain ramps.** `GainNode.gain` is a-rate [wa-gain]. `linearRampToValueAtTime`
"schedules a linear continuous change in parameter value from the previous
scheduled parameter value to the given value"; if no event precedes it, it
behaves "as if setValueAtTime(value, currentTime) were called" [wa-ramp].
`cancelAndHoldAtTime` cancels later automation and holds the value the curve
would have had at the cancel time [wa-cah]. `setTargetAtTime` is exponential
with `timeConstant` reaching 63% of the way per constant [wa-tgt]; it never
reaches zero exactly, so a subsequent `stop()` is still required.

### 1.3 Verdict: two engines, one Transport

| Need | Media element | Buffer node |
|---|---|---|
| Play from Playhead across a 60-min Source | streams from file, zero heap | needs the whole Source as float (1.27-1.38 GB) or a custom streaming worklet |
| Restart on scrub | seek, tens of ms, audio gap | rebuild/reslice buffer from `window()`, but only if the buffer already exists |
| Play a Region exactly once | end enforced by rAF polling, overshoot | `start(t0)` + `stop(t0 + pass)`: frame-exact |
| Loop a Region seamlessly | seek per wrap: not seamless (ticket 03) | native, spec-guaranteed gapless |
| Stop on keyup without a click | `pause()` is a hard cut at an arbitrary sample | gain ramp then `stop()` |
| Anchor audition (600 ms) | seek + preroll for 600 ms of audio | 230 KB buffer, no seek |
| Playhead/cursor source of truth | `media.currentTime` | `ctx.currentTime - t0` |

**Recommendation:** two engines (`MediaEngine`, `BufferEngine`) inside one
`Transport` module. The Transport, not the UI, enforces mutual exclusion:
starting either engine stops the other first. They do not share an output
path (`createMediaElementSource` would tie the element to the context for
life and buys nothing here); the only shared resource is the `AudioContext`,
created once per session at the Source rate.

## 2. Building a Region buffer from `Source.window`

### Memory (60-second Region, stereo)

| Rate | Frames | Int16 from `window()` (transient) | Float32 `AudioBuffer` | 24-bit WAV bytes read |
|---|---|---|---|---|
| 44.1 kHz | 2,646,000 | 10,584,000 B = 10.1 MiB | 21,168,000 B = 20.2 MiB | 15.9 MB |
| 48 kHz | 2,880,000 | 11,520,000 B = 11.0 MiB | 23,040,000 B = 22.0 MiB | 17.3 MB |

Anchor audition, 300 ms either side (600 ms): 28,800 frames at 48 kHz,
230 KB float. Ten minutes: 230 MiB float. The whole Source as a Region would
be the 1.27-1.38 GB the decode doc avoids.

`AudioBuffer` channel data and `Int16Array` backing stores live outside the
V8 heap (decode doc section 2), so none of this counts against the JS heap
limit. `createBuffer` fails with `NotSupportedError` in Chromium (MDN says
`RangeError`) only if allocation fails [decode doc, section 2].

### Build steps (recommendation)

```
chans   = await source.window({ start, end })      // Int16Array per channel
buffer  = ctx.createBuffer(chans.length, end - start, source.info.sampleRate)
for ch: f32 = buffer.getChannelData(ch); for i: f32[i] = chans[ch][i] / 32768
```

- 2.9M frames x 2 channels of `x / 32768` is a few milliseconds on the main
  thread; no Worker needed. Divide by 32768 so that -32768 maps to -1.0
  exactly; the decode doc's export rule multiplies by 32767, and the two
  need not match because preview audio is never written back.
- On the WAV path `window()` is a `File.slice(...).arrayBuffer()` of 11-17 MB
  plus a byte-to-Int16 pass; Chrome serves it from page cache after the
  peaks pass. It is async and takes tens of milliseconds the first time.
  Build the buffer when the Active Region *changes* (on `h`/`l`, on entering
  Region Select mode, on each Anchor move in Insert mode debounced to the
  next animation frame), not on keydown, so Space is instant.
- The decode doc labels `window()` "small windows only". That is a
  performance note about zero-crossing search, not a contract; Region-length
  reads are the same code path. Ticket 08 asks ticket 02's implementation to
  keep `window()` efficient for ranges up to the cap below.
- **Cache one buffer** keyed by `{start, end}`; drop it when the key changes.
  Two buffers (Active Region plus draft) is the most that is ever live.
- **Cap at 10 minutes** (recommendation). Above it, `preview` refuses to loop
  (toast: "Region too long to loop") and plays once through the media
  engine with `stopAt`. Sample hunting never produces such Regions; the cap
  exists so a mis-drawn Region cannot allocate a gigabyte.
- Build the loop as the whole buffer: `loop = true`, leave `loopStart` and
  `loopEnd` at 0. Chromium resolves `loopEnd == 0` to the buffer duration
  [absh]; there is no way to be more exact than "the buffer is the Region".
- Boundary audition: `window({ start: anchor - 0.3 s, end: anchor + 0.3 s })`
  clamped to the Source, played once. Both halves come from the same read,
  so the Anchor sits at frame `0.3 s * rate` of the buffer and the overlay
  can draw a tick there. Optionally play the two halves as two nodes with a
  2-3 ms silence between them so the ear can place the boundary; that is a
  ticket 05/09 taste decision.

### Scheduling for a known `t0` (recommendation)

`start(0)` begins "immediately", which in Chromium means the first quantum
the audio thread renders after the control message lands; the main thread
cannot know that frame exactly. Passing `when = ctx.currentTime + lead` with
`lead` of one callback buffer plus one quantum (`(256 + 128) / rate`,
about 8 ms) makes the start frame deterministic (`ceil(when * rate)`), so the
overlay Playhead and every later `stop(t0 + k * pass)` share one exact `t0`.
The cost is ~8 ms of added latency on tap, below the ~15-25 ms already in
`baseLatency + outputLatency`. If the prototype finds the extra lead
perceptible, drop it and accept up to one callback buffer of error in the
overlay position (5 ms = 5 px at 1000 px/s).

## 3. Keeping the Playhead in sync

**Position is derived from clocks, never pushed.** The Transport exposes
`position(): number | null` (a frame) that reads the engine's clock on every
call:

- Media engine: `Math.round(media.currentTime * rate)`. During a seek this
  is the target frame (Chromium returns `last_seek_time_`), which is what
  the Playhead should show while audio catches up.
- Buffer engine: `startFrame + ((ctx.currentTime - t0) * rate) mod
  passFrames` while looping, unwrapped while playing once. Optionally
  subtract `ctx.outputLatency` (rounded to 8 ms in Chrome without mic
  permission) so the cursor shows what is *audible* rather than what is
  *rendered*; `getOutputTimestamp()` is the more precise alternative. Either
  is a one-line change; choose in the prototype.

**Who draws what.**

- Playhead mode: wavesurfer's own cursor. wavesurfer's rAF timer already
  polls `media.currentTime` and calls `renderer.renderProgress` while the
  element plays [ws-main L258-276]; nothing to add. Because the Transport
  owns the same element (`WaveSurfer.create({ media })` accepts an external
  element [ws-player L53-57]), wavesurfer's `play`/`pause`/`timeupdate`
  events keep firing.
- Buffer previews: the overlay preview Playhead recommended in ticket 03,
  driven by the UI's rAF loop calling `transport.position()`. The model
  Playhead does not move during a preview (only `p`/`P` move it), so the
  overlay cursor is the semantically right element, not wavesurfer's.
- `ws.setTime()` is never called while a buffer preview plays: it assigns
  `media.currentTime` [ws-player L272-274], which is a pipeline seek
  (section 1.1), and clears `stopAtPosition`. `ws.getRenderer()` is public
  at 7.12.11 (`wavesurfer.ts` L190) and `renderProgress(progress)` moves
  the cursor without seeking (it is what wavesurfer's own drag handler
  does, L388), so a single-cursor design *is* possible; it is not
  recommended because the cursor *is* the Playhead and the Playhead does
  not move during preview.

**Events are for state, not time.** The Transport emits `statechange` on
start/stop/engine change and `ended` when a one-shot or a finishing pass
completes. It does not emit per-frame ticks; the UI's rAF loop pulls
`position()` so there is exactly one animation clock in the app.

## 4. Keys to Transport

### Playhead mode

- `Space` (idle): `transport.play(playheadFrame)`. Return point = that
  frame. Media engine: `media.currentTime = frame / rate; await
  media.play()`. Handle the promise rejection (autoplay) by toasting.
- `Space` (playing): `transport.stop()` pauses the element, then sets
  `media.currentTime = returnFrame / rate` so wavesurfer's cursor snaps
  back through its `seeking`/`timeupdate` path. The Playhead model already
  holds the Return point; the seek only aligns the element.
- Scrub while playing: `transport.play(newFrame)` again. Each call is a seek
  (never elided while playing); Chromium collapses seeks that arrive during
  an in-flight seek to the last one [pc]. Key auto-repeat at ~30 Hz will
  produce audible stutter during the hold, which is acceptable for
  "scrubbing", but the Transport should still coalesce `play()` calls to one
  per animation frame (trailing edge) so a burst of repeats is one seek
  (recommendation; prototype).
- The stop-at-end of the media element is not needed in Playhead mode;
  playback runs to the Source end and `ended` fires (`finish` in
  wavesurfer), at which point the Transport snaps back to the Return point
  like a Space.

### Region Select mode: tap and hold

Requirements: "keydown starts a loop; keyup before one pass completes lets
the pass finish; keyup after a full pass stops at once; a tap under 200 ms
always plays exactly one pass."

```
keydown (event.code === 'Space', !event.repeat):
  t0   = ctx.currentTime + lead
  node = new AudioBufferSourceNode(ctx, { buffer, loop: true })
  gain = new GainNode(ctx, { gain: 1 })
  node.connect(gain).connect(ctx.destination)
  node.start(t0)
  pass = buffer.length / rate

keyup:
  elapsed = ctx.currentTime - t0
  if elapsed < pass:            // includes every tap shorter than a pass
    node.stop(t0 + pass)        // pass finishes on its own frame
  else:
    now = ctx.currentTime
    gain.gain.cancelAndHoldAtTime(now)
    gain.gain.linearRampToValueAtTime(0, now + 0.008)
    node.stop(now + 0.010)
node.onended -> emit 'ended', disconnect both nodes
```

- `KeyboardEvent.repeat` "is true if the given key is being held down such
  that it is automatically repeating" [mdn-repeat]; every repeated keydown
  is ignored so the loop starts once.
- The first branch is frame-exact because `stop` rounds the end time up to
  a frame [assh]. Equivalent: `node.loop = false`, which Chromium applies
  under the process lock so the current pass runs to the buffer end
  [absh]. Prefer `stop(t0 + pass)`: it does not depend on how many wraps
  have happened and does not race the audio thread.
- The tap rule: any keyup before the first pass ends yields exactly one
  pass. For Regions shorter than 200 ms a tap longer than the pass has
  already looped before keyup; "exactly one pass" cannot be honoured after
  the fact. Either accept it (a 150 ms hit looped twice is not a bug) or,
  for `pass < 0.2`, start with `loop = false` and re-arm on the next repeat
  keydown; ticket 09 decides.
- The ramp is 8 ms of `linearRampToValueAtTime` on an a-rate `GainNode`,
  then `stop` 2 ms later. Eight milliseconds is long enough to avoid a
  click on bass-heavy material and short enough to feel immediate; it is a
  starting value for the prototype, not a spec fact.
- Region ends that ticket 05 has snapped to zero crossings make the natural
  pass end click-free; the ramp is only for the mid-pass stop.
- If the buffer for the Active Region is still being built when Space
  arrives (the user hit `l` then Space within ~50 ms), the Transport
  awaits the build and starts as soon as it resolves; keyup that arrives
  before the start is honoured by starting with `stop(t0 + pass)` already
  scheduled.

### Insert Region mode: draft preview and audition

- `Space` with both Anchors: the draft `{ start, end }` is a Region-shaped
  range; the same tap/hold code applies (candidate in requirements). With
  one Anchor, Space plays the boundary audition of the active Anchor
  instead (recommendation).
- Anchor audition (`audition(frame)`): 600 ms one-shot, `start(t0)`,
  `stop(t0 + 0.6)`, no loop. Emits `ended`. A scrub during the audition
  cancels it (ramp + stop) and, if the key is a repeat, does not re-trigger
  until the repeat stream ends (recommendation; prototype).

## 5. The Transport seam

One module, `transport/`, imports nothing from React or wavesurfer. It takes
a `Source` and an `HTMLAudioElement` it owns (created by the Transport and
handed to wavesurfer via `WaveSurfer.create({ media })`), speaks frames, and
is testable with a fake `AudioContext`.

```ts
// transport/types.ts
import type { FrameRange, Source } from '../source/types'

export type TransportState =
  | { kind: 'idle' }
  | { kind: 'playing';  engine: 'media';  from: number; returnFrame: number }
  | { kind: 'preview';  engine: 'buffer'; range: FrameRange; loop: boolean; t0: number }
  | { kind: 'audition'; engine: 'buffer'; range: FrameRange; anchor: number; t0: number }

export type TransportEvents = {
  /** Any transition between the states above, including engine hand-over. */
  statechange: [state: TransportState]
  /** A one-shot, a finishing pass, or media reaching the Source end completed on its own. */
  ended: [reason: 'pass' | 'audition' | 'source-end']
  /** Autoplay refusal, decode failure, or the Region exceeds the buffer cap. */
  error: [error: TransportError]
}

export type TransportError =
  | { code: 'not-allowed'; message: string }        // media.play() rejected / context suspended
  | { code: 'too-long'; frames: number; capFrames: number }
  | { code: 'read-failed'; message: string }         // Source.window rejected (file changed on disk)

export interface Transport {
  readonly state: TransportState
  /** Current frame of whatever is audible, or null when idle. Pure clock read; call from rAF. */
  position(): number | null

  // Playhead mode (media engine)
  /** Play from `frame`; it becomes the Return point. Calling while playing restarts (restart-on-scrub). */
  play(frame: number): Promise<void>
  /** Stop and snap the media element back to the Return point. No-op when idle. */
  stop(): void

  // Region Select / Insert Region (buffer engine)
  /** Make `range` playable without latency. Idempotent; cancels a previous prepare. */
  prepare(range: FrameRange): Promise<void>
  /** keydown: start looping `range` (prepares first if needed). */
  previewStart(range: FrameRange): Promise<void>
  /** keyup: finish the current pass if the first pass is incomplete, else ramp and stop now. */
  previewRelease(): void
  /** Play `range` exactly once (used for the draft when hold semantics are off). */
  previewOnce(range: FrameRange): Promise<void>
  /** 300 ms either side of `frame`, once. */
  audition(frame: number, halfWidthFrames?: number): Promise<void>
  /** Hard stop of any engine, with the gain ramp on the buffer engine. */
  cancel(): void

  on<K extends keyof TransportEvents>(event: K, fn: (...args: TransportEvents[K]) => void): () => void
  /** Close the AudioContext, revoke the blob URL, detach the element. */
  dispose(): void
}

export interface TransportOptions {
  /** Max Region length for the buffer engine. Default 10 min of frames. */
  capFrames?: number
  /** Seconds of scheduling lead for a deterministic t0. Default (256 + 128) / rate. */
  lead?: number
  /** Gain ramp on mid-pass stop, seconds. Default 0.008. */
  releaseSeconds?: number
  /** Subtract outputLatency in position(). Default true. */
  compensateOutputLatency?: boolean
}

export function createTransport(
  source: Source,
  media: HTMLAudioElement,
  opts?: TransportOptions,
): Transport
```

Why this shape:

- Everything is a frame; `Source.info.sampleRate` is the only conversion
  constant, and it lives inside the Transport. The UI hands wavesurfer
  seconds (`frame / rate`) exactly as the decode doc prescribes.
- `position()` is pull, not push, so React never re-renders on audio time.
  The UI keeps one `requestAnimationFrame` loop that calls `position()` and
  writes to the overlay cursor's `style.left`. That loop is also where the
  media-engine cursor would go if wavesurfer's timer is ever disabled.
- `previewStart`/`previewRelease` mirror keydown/keyup one-to-one; the tap
  rule, the pass arithmetic, and the ramp are inside the Transport, so the
  keymap prototype (ticket 09) can change timing constants without touching
  key handling.
- `prepare` is separate from `previewStart` so the UI can build the buffer
  on Region change and Space stays instant; `previewStart` on an unprepared
  range still works, just later.
- `play`/`stop` and the buffer methods are all "stop the other engine
  first"; the UI never has to reason about which engine is live.
- Two internal engines behind the interface: `MediaEngine` (blob URL from
  `source.media()`, `play`/`pause`/`currentTime`, `ended` listener) and
  `BufferEngine` (one `AudioContext` at `source.info.sampleRate`, buffer
  cache, node/gain lifecycle). Each is small enough to unit-test with fakes.
- Wavesurfer integration is one line in the UI:
  `WaveSurfer.create({ media, peaks, duration, ... })`. wavesurfer then sees
  the element's `play`/`pause`/`timeupdate`/`seeking` and animates its own
  cursor; it never sees the buffer engine.

## 6. Handed to other tickets and to the prototype

- Ticket 02 implementation: keep `Source.window()` efficient for
  Region-length ranges (up to the cap); the WAV path is one slice read.
- Ticket 03 overlay: the preview Playhead is driven by
  `transport.position()` from the UI's rAF loop; show it only in
  `preview`/`audition` states.
- Ticket 05: zero-crossing snapping is what makes the natural pass end
  click-free; the Transport's ramp covers only the mid-pass stop.
- Ticket 09 prototype checks, in order: (1) measure keydown-to-audio for
  both engines with `getOutputTimestamp()`; (2) confirm the loop is gapless
  with a test tone whose period does not divide the Region length; (3) tune
  `lead` and `releaseSeconds`; (4) decide the sub-200 ms Region tap rule;
  (5) confirm `ctx.state` after the first Space without a prior click;
  (6) measure media seek latency on a 1 GB WAV to ground "tens of ms".
- Not needed: `createMediaElementSource`, `backend: 'WebAudio'` in
  wavesurfer, `AudioWorklet`, `decodeAudioData` of the Region (we already
  have PCM), `fastSeek` (Chrome does not implement it [html-fs]).

[wa-start]: https://webaudio.github.io/web-audio-api/#dom-audiobuffersourcenode-start
[wa-loop]: https://webaudio.github.io/web-audio-api/#looping-AudioBufferSourceNode
[wa-stop]: https://webaudio.github.io/web-audio-api/#dom-audioscheduledsourcenode-stop
[wa-ended]: https://webaudio.github.io/web-audio-api/#dom-audioscheduledsourcenode-onended
[wa-ct]: https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-currenttime
[wa-ol]: https://webaudio.github.io/web-audio-api/#dom-audiocontext-outputlatency
[wa-ots]: https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp
[wa-opts]: https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-samplerate
[wa-gain]: https://webaudio.github.io/web-audio-api/#dom-gainnode-gain
[wa-ramp]: https://webaudio.github.io/web-audio-api/#dom-audioparam-linearramptovalueattime
[wa-cah]: https://webaudio.github.io/web-audio-api/#dom-audioparam-cancelandholdattime
[wa-tgt]: https://webaudio.github.io/web-audio-api/#dom-audioparam-settargetattime
[html-seek]: https://html.spec.whatwg.org/multipage/media.html#dom-media-seek
[html-tmo]: https://html.spec.whatwg.org/multipage/media.html#time-marches-on
[html-fs]: https://html.spec.whatwg.org/multipage/media.html#dom-media-fastseek
[html-act]: https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event
[hme]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/html/media/html_media_element.cc
[wmpi]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/media/web_media_player_impl.cc
[pc]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/filters/pipeline_controller.cc
[ari]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/renderers/audio_renderer_impl.cc
[ara]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/filters/audio_renderer_algorithm.cc
[absh]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/audio_buffer_source_handler.cc
[assh]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/audio_scheduled_source_handler.cc
[autil]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/audio/audio_utilities.cc
[ac]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/audio_context.cc
[ad]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/audio/audio_destination.cc
[amm]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/audio/mac/audio_manager_mac.cc
[limits]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/limits.h
[ffcfg]: https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/refs/heads/master/chromium/config/Chrome/mac/x64/config_components.h
[wavdec]: https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/refs/heads/master/libavformat/wavdec.c
[i2s-ol]: https://groups.google.com/a/chromium.org/g/blink-dev/c/dTQniJNVVMY
[autoplay]: https://developer.chrome.com/blog/autoplay
[mdn-repeat]: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat
[ws-main]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/wavesurfer.ts
[ws-player]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/player.ts
[ws-timer]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.11/src/timer.ts
