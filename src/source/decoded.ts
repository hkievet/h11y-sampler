/**
 * Decoded path: MP3, FLAC, M4A, and anything else the browser can decode.
 * Sniffs the container's sample rate first (Chrome resamples to the
 * context's rate otherwise), decodes once, converts to interleaved Int16
 * in chunks while building the peaks level, and drops the AudioBuffer.
 * Chops are 16-bit PCM at the Source rate.
 */
import { PeaksLevel, bucketRaw } from './peaks'
import { basename, clampRange, type FrameRange, type OpenOptions, type Source, type SourceInfo } from './types'

const MP3_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
}

/** Best-effort sample rate from the container; null when unknown. Exported for tests. */
export function sniffSampleRate(head: Uint8Array): number | null {
  const s = (o: number, n: number) => String.fromCharCode(...head.subarray(o, o + n))
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength)
  // FLAC: 'fLaC' then STREAMINFO block; sample rate is 20 bits at data offset 10
  if (s(0, 4) === 'fLaC' && head.length >= 8 + 18) {
    const d = 8
    return (head[d + 10]! << 12) | (head[d + 11]! << 4) | (head[d + 12]! >> 4)
  }
  // OGG: Opus is always 48k; Vorbis carries the rate in its identification header
  if (s(0, 4) === 'OggS') {
    for (let i = 0; i < head.length - 12; i++) {
      if (s(i, 8) === 'OpusHead') return 48000
      if (head[i] === 1 && s(i + 1, 6) === 'vorbis') return dv.getUint32(i + 12, true)
    }
    return null
  }
  // MP4/M4A: find the 'mp4a' sample entry; sample rate is 16.16 fixed at +32
  if (s(4, 4) === 'ftyp') {
    for (let i = 0; i < head.length - 36; i++) {
      if (s(i, 4) === 'mp4a') {
        const r = dv.getUint32(i + 4 + 28, false) >>> 16
        if (r > 0) return r
      }
    }
    return null
  }
  // MP3: skip an ID3v2 tag, then read the first frame header
  let o = 0
  if (s(0, 3) === 'ID3' && head.length >= 10) {
    o = 10 + ((head[6]! & 0x7f) << 21 | (head[7]! & 0x7f) << 14 | (head[8]! & 0x7f) << 7 | (head[9]! & 0x7f))
  }
  for (let i = o; i < head.length - 4; i++) {
    if (head[i] === 0xff && (head[i + 1]! & 0xe0) === 0xe0) {
      const version = (head[i + 1]! >> 3) & 3
      const rateIdx = (head[i + 2]! >> 2) & 3
      const rates = MP3_RATES[version]
      if (rates && rateIdx < 3) return rates[rateIdx]!
    }
  }
  return null
}

export class DecodedSource implements Source {
  readonly info: SourceInfo
  private level: PeaksLevel

  private constructor(private file: File, private pcm: Int16Array, sampleRate: number, channels: number, level: PeaksLevel) {
    const frames = pcm.length / channels
    this.info = {
      name: basename(file.name),
      sampleRate,
      channels,
      frames,
      duration: frames / sampleRate,
      origin: 'decoded',
      format: { kind: 'pcm', bits: 16, validBits: 16 },
      truncated: false,
    }
    this.level = level
  }

  static async open(file: File, opts: OpenOptions = {}): Promise<DecodedSource> {
    const head = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer())
    const rate = sniffSampleRate(head) ?? 48000
    const ctx = new OfflineAudioContext(1, 1, rate)
    let buffer: AudioBuffer | null = await ctx.decodeAudioData(await file.arrayBuffer())
    const channels = buffer.numberOfChannels
    const frames = buffer.length
    const pcm = new Int16Array(frames * channels)
    const level = new PeaksLevel(channels, frames)
    const chunk = Math.min(frames, buffer.sampleRate)
    const tmp = new Float32Array(chunk)
    const chans: Int16Array[] = []
    for (let c = 0; c < channels; c++) chans.push(new Int16Array(chunk))
    for (let f = 0; f < frames; f += chunk) {
      const n = Math.min(chunk, frames - f)
      for (let c = 0; c < channels; c++) {
        buffer.copyFromChannel(tmp, c, f)
        const dst = chans[c]!
        for (let i = 0; i < n; i++) {
          const v = Math.max(-32768, Math.min(32767, Math.round(tmp[i]! * 32767)))
          dst[i] = v
          pcm[(f + i) * channels + c] = v
        }
      }
      level.push(chans.map((x) => x.subarray(0, n)), f)
      opts.onProgress?.((f + n) / frames)
    }
    buffer = null
    return new DecodedSource(file, pcm, rate, channels, level)
  }

  async peaks(buckets: number, range?: FrameRange): Promise<Float32Array[]> {
    const r = clampRange(range ?? { start: 0, end: this.info.frames }, this.info.frames)
    if ((r.end - r.start) / buckets >= this.level.framesPerBucket) return this.level.rebucket(buckets, r)
    return bucketRaw(await this.window(r), buckets)
  }

  async window(range: FrameRange): Promise<Int16Array[]> {
    const r = clampRange(range, this.info.frames)
    const n = Math.max(0, r.end - r.start)
    const ch = this.info.channels
    const out: Int16Array[] = []
    for (let c = 0; c < ch; c++) {
      const a = new Int16Array(n)
      for (let i = 0; i < n; i++) a[i] = this.pcm[(r.start + i) * ch + c]!
      out.push(a)
    }
    return out
  }

  async slice(range: FrameRange): Promise<Blob> {
    const r = clampRange(range, this.info.frames)
    const n = Math.max(0, r.end - r.start)
    const ch = this.info.channels
    const bodyBytes = n * ch * 2
    const out = new Uint8Array(44 + bodyBytes)
    const dv = new DataView(out.buffer)
    const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i) }
    put(0, 'RIFF'); dv.setUint32(4, 36 + bodyBytes, true); put(8, 'WAVE')
    put(12, 'fmt '); dv.setUint32(16, 16, true)
    dv.setUint16(20, 1, true); dv.setUint16(22, ch, true)
    dv.setUint32(24, this.info.sampleRate, true); dv.setUint32(28, this.info.sampleRate * ch * 2, true)
    dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true)
    put(36, 'data'); dv.setUint32(40, bodyBytes, true)
    let o = 44
    const from = r.start * ch
    for (let i = 0; i < n * ch; i++, o += 2) dv.setInt16(o, this.pcm[from + i]!, true)
    return new Blob([out], { type: 'audio/wav' })
  }

  media(): Blob {
    return this.file
  }

  dispose() {
    this.pcm = new Int16Array(0)
  }
}
