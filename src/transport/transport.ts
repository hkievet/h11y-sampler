/**
 * Transport: two engines behind one seam, all in frames.
 *
 * - The media engine plays the original file through an <audio> element on
 *   a blob URL: Playhead-mode play, restart-on-scrub, zero heap.
 * - The buffer engine plays per-range AudioBufferSourceNodes built from
 *   Source.window(range): sample-exact Region previews (tap once, hold
 *   loops), Anchor auditions, and export playback.
 *
 * `position()` is a pure clock read for the view's animation frame loop.
 * No React, no wavesurfer. See research/playback-engine.md.
 */
import type { FrameRange, Source } from '../source'

export type CursorKind = 'playhead' | 'audition' | 'preview' | 'export'

export type TransportState =
  | { kind: 'idle' }
  | { kind: 'playhead'; from: number }
  | { kind: 'preview'; range: FrameRange; t0: number; passLen: number; releasing: boolean }
  | { kind: 'audition' | 'export'; range: FrameRange; t0: number }

export interface TransportOptions {
  /** max range for the buffer engine; default ten minutes of frames */
  capFrames?: number
  /** scheduling lead in seconds; default 8 ms */
  lead?: number
  /** gain ramp on a mid-pass stop, seconds; default 8 ms */
  releaseSeconds?: number
}

export interface Transport {
  readonly state: TransportState
  /** current audible frame, or null when idle */
  position(): number | null
  cursorKind(): CursorKind | null
  /** Playhead mode: play from `frame`; calling while playing restarts there */
  play(frame: number): void
  /** buffer engine, keydown: start looping `range` */
  previewStart(range: FrameRange): Promise<void>
  /** buffer engine, keyup: finish the pass if the first is incomplete, else ramp and stop */
  previewRelease(): void
  /** buffer engine: play `range` once (auditions, export playback) */
  once(range: FrameRange, kind: 'audition' | 'export'): Promise<void>
  /** build the buffer for `range` ahead of time so Space is instant */
  prepare(range: FrameRange): void
  /** stop whatever is playing, with the gain ramp on the buffer engine */
  cancel(): void
  /** fired when playback ends on its own (a pass finished, an audition ended, the media reached the end) */
  onEnded(fn: () => void): () => void
  dispose(): void
}

export function createTransport(source: Source, opts: TransportOptions = {}): Transport {
  const sr = source.info.sampleRate
  const capFrames = opts.capFrames ?? 10 * 60 * sr
  const lead = opts.lead ?? 0.008
  const release = opts.releaseSeconds ?? 0.008

  // ---- media engine ----
  const url = URL.createObjectURL(source.media())
  const audio = new Audio()
  audio.src = url
  audio.preload = 'auto'

  // ---- buffer engine ----
  let ctx: AudioContext | null = null
  let node: AudioBufferSourceNode | null = null
  let gain: GainNode | null = null
  let seq = 0
  const cache = new Map<string, Promise<AudioBuffer>>()
  const key = (r: FrameRange) => `${r.start}:${r.end}`

  let state: TransportState = { kind: 'idle' }
  const listeners = new Set<() => void>()
  const ended = () => listeners.forEach((fn) => fn())

  function context(): AudioContext {
    if (!ctx) ctx = new AudioContext({ sampleRate: sr })
    if (ctx.state !== 'running') void ctx.resume()
    return ctx
  }

  function buildBuffer(range: FrameRange): Promise<AudioBuffer> {
    const k = key(range)
    let p = cache.get(k)
    if (!p) {
      p = (async () => {
        const chans = await source.window(range)
        const c = context()
        const buf = c.createBuffer(chans.length, chans[0]!.length, sr)
        chans.forEach((data, ch) => {
          const f = new Float32Array(data.length)
          for (let i = 0; i < data.length; i++) f[i] = data[i]! / 32768
          buf.copyToChannel(f, ch)
        })
        return buf
      })()
      cache.set(k, p)
      if (cache.size > 8) cache.delete(cache.keys().next().value!)
    }
    return p
  }

  function killNode(ramp: boolean) {
    if (!node || !gain || !ctx) return
    const n = node
    const g = gain
    node = null
    gain = null
    n.onended = null
    if (ramp) {
      const now = ctx.currentTime
      if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(now)
      else g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, now + release)
      try { n.stop(now + release + 0.002) } catch { /* already stopped */ }
    } else {
      try { n.stop() } catch { /* already stopped */ }
    }
  }

  function stopMedia() {
    if (!audio.paused) audio.pause()
  }

  function startNode(buf: AudioBuffer, loop: boolean, stopAfter: number | null): number {
    const c = context()
    killNode(false)
    const n = c.createBufferSource()
    n.buffer = buf
    if (loop) { n.loop = true; n.loopStart = 0; n.loopEnd = buf.duration }
    const g = c.createGain()
    n.connect(g)
    g.connect(c.destination)
    const t0 = c.currentTime + lead
    n.start(t0)
    if (stopAfter != null) n.stop(t0 + stopAfter)
    const mySeq = ++seq
    n.onended = () => {
      if (node === n && seq === mySeq) {
        node = null
        gain = null
        state = { kind: 'idle' }
        ended()
      }
    }
    node = n
    gain = g
    return t0
  }

  audio.addEventListener('ended', () => {
    if (state.kind === 'playhead') {
      state = { kind: 'idle' }
      ended()
    }
  })

  const t: Transport = {
    get state() {
      return state
    },
    position() {
      if (state.kind === 'idle') return null
      if (state.kind === 'playhead') return Math.round(audio.currentTime * sr)
      if (!ctx) return state.range.start
      const el = ctx.currentTime - state.t0
      if (el <= 0) return state.range.start
      if (state.kind === 'preview') return state.range.start + Math.round((el % state.passLen) * sr)
      return Math.min(state.range.end, state.range.start + Math.round(el * sr))
    },
    cursorKind() {
      return state.kind === 'idle' ? null : state.kind
    },
    play(frame) {
      killNode(true)
      seq++
      audio.currentTime = frame / sr
      state = { kind: 'playhead', from: frame }
      void audio.play().catch(() => {
        state = { kind: 'idle' }
        ended()
      })
    },
    async previewStart(range) {
      if (state.kind === 'preview') return // repeat keydown
      if (range.end - range.start > capFrames) return
      stopMedia()
      const mySeq = seq + 1
      const buf = await buildBuffer(range)
      if (seq + 1 !== mySeq) return // something else started meanwhile
      const passLen = buf.duration
      const t0 = startNode(buf, true, null)
      state = { kind: 'preview', range, t0, passLen, releasing: false }
    },
    previewRelease() {
      if (state.kind !== 'preview' || !node || !ctx) return
      const elapsed = ctx.currentTime - state.t0
      if (elapsed < state.passLen) {
        // finish the current pass, frame-exact
        node.stop(state.t0 + state.passLen * Math.max(1, Math.ceil(elapsed / state.passLen)))
        state = { ...state, releasing: true }
      } else {
        killNode(true)
        state = { kind: 'idle' }
        ended()
      }
    },
    async once(range, kind) {
      if (range.end - range.start > capFrames) return
      stopMedia()
      const mySeq = seq + 1
      const buf = await buildBuffer(range)
      if (seq + 1 !== mySeq) return
      const t0 = startNode(buf, false, buf.duration)
      state = { kind, range, t0 }
    },
    prepare(range) {
      if (range.end > range.start && range.end - range.start <= capFrames && ctx) void buildBuffer(range)
    },
    cancel() {
      seq++
      killNode(true)
      stopMedia()
      state = { kind: 'idle' }
    },
    onEnded(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    dispose() {
      seq++
      killNode(false)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      void ctx?.close()
      ctx = null
      cache.clear()
      listeners.clear()
    },
  }
  return t
}
