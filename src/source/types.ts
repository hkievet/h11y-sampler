/**
 * Source: the one module that knows what audio bytes mean.
 * Everything is in frames (sample index at the Source's rate); seconds are
 * derived by the view. No React, no wavesurfer, testable in node.
 */

export type SampleFormat =
  | { kind: 'pcm'; bits: 8 | 16 | 24 | 32; validBits: number }
  | { kind: 'float'; bits: 32 | 64 }

export interface SourceInfo {
  /** basename without extension; seeds Chop names */
  name: string
  sampleRate: number
  channels: number
  /** total sample-frames */
  frames: number
  /** frames / sampleRate, seconds */
  duration: number
  /** wav = byte-exact passthrough; decoded = 16-bit PCM export */
  origin: 'wav' | 'decoded'
  format: SampleFormat
  /** wav data chunk ran past EOF (recorder lost power); we used what was there */
  truncated: boolean
}

/** end exclusive; integers; 0 <= start < end <= frames */
export interface FrameRange {
  start: number
  end: number
}

export interface Source {
  readonly info: SourceInfo
  /**
   * For the waveform: max magnitude per bucket in 0..1, one Float32Array per
   * channel, `buckets` entries over `range` (default: the whole Source).
   */
  peaks(buckets: number, range?: FrameRange): Promise<Float32Array[]>
  /** Raw frames as Int16 per channel, deinterleaved. Bounded ranges only. */
  window(range: FrameRange): Promise<Int16Array[]>
  /** A Chop: a complete WAV Blob for `range`. */
  slice(range: FrameRange): Promise<Blob>
  /** Playable media for the <audio> element: the original File. */
  media(): Blob
  /** Release buffers. */
  dispose(): void
}

export interface OpenOptions {
  /** 0..1 while peaks are computed */
  onProgress?: (p: number) => void
}

export const clampRange = (r: FrameRange, frames: number): FrameRange => ({
  start: Math.max(0, Math.min(frames, Math.floor(r.start))),
  end: Math.max(0, Math.min(frames, Math.ceil(r.end))),
})

export function basename(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(0, i) : fileName
}
