/**
 * WAV fast path: RIFF/RF64 chunk walker, sample readers, and byte-exact
 * Chop construction. A Chop is a rewritten header plus a File.slice byte
 * range; the data chunk never touches the heap.
 */
import { PeaksLevel, bucketRaw } from './peaks'
import { basename, clampRange, type FrameRange, type OpenOptions, type SampleFormat, type Source, type SourceInfo } from './types'

export interface WavLayout {
  formatTag: number
  format: SampleFormat
  channels: number
  sampleRate: number
  blockAlign: number
  /** the whole `fmt ` chunk, id and size included, verbatim */
  fmtChunk: Uint8Array
  /** byte offset of the first frame */
  dataOffset: number
  /** bytes of audio, whole frames */
  dataBytes: number
  frames: number
  truncated: boolean
}

const ascii = (u8: Uint8Array, o: number, n: number) => String.fromCharCode(...u8.subarray(o, o + n))
const FLOAT_GUID_TAIL = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71]

/**
 * Walk the chunks in `head` (the first bytes of the file). Returns null when
 * this is not a WAV we pass through byte-exact (then the caller decodes).
 * Returns 'more' when the `data` chunk lies beyond `head`.
 */
export function parseWav(head: Uint8Array, fileSize: number): WavLayout | null | 'more' {
  if (head.length < 12) return null
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const riff = ascii(head, 0, 4)
  if ((riff !== 'RIFF' && riff !== 'RF64') || ascii(head, 8, 4) !== 'WAVE') return null
  const rf64 = riff === 'RF64'
  let ds64Data: number | null = null
  let fmt: Uint8Array | null = null
  let dataOffset = -1
  let dataSize = -1
  let off = 12
  while (off + 8 <= head.length) {
    const id = ascii(head, off, 4)
    let size = dv.getUint32(off + 4, true)
    if (id === 'ds64' && rf64) {
      // riffSize u64, dataSize u64, sampleCount u64, table...
      const lo = dv.getUint32(off + 8 + 8, true)
      const hi = dv.getUint32(off + 8 + 12, true)
      ds64Data = hi * 0x1_0000_0000 + lo
    } else if (id === 'fmt ') {
      fmt = head.slice(off, off + 8 + size)
    } else if (id === 'data') {
      if (size === 0xffffffff && ds64Data != null) size = ds64Data
      dataOffset = off + 8
      dataSize = size
      break
    }
    off += 8 + size + (size & 1)
  }
  if (dataOffset < 0) return off + 8 > head.length && head.length < fileSize ? 'more' : null
  if (!fmt || fmt.length < 8 + 16) return null

  const f = new DataView(fmt.buffer, fmt.byteOffset, fmt.byteLength)
  let formatTag = f.getUint16(8, true)
  const channels = f.getUint16(10, true)
  const sampleRate = f.getUint32(12, true)
  const blockAlign = f.getUint16(20, true)
  const bits = f.getUint16(22, true)
  let validBits = bits
  if (formatTag === 0xfffe) {
    if (fmt.length < 8 + 40) return null
    validBits = f.getUint16(26, true) || bits
    const sub = f.getUint16(32, true)
    for (let i = 0; i < 14; i++) if (fmt[34 + i] !== FLOAT_GUID_TAIL[i]) return null
    formatTag = sub
  }
  let format: SampleFormat
  if (formatTag === 1 && (bits === 8 || bits === 16 || bits === 24 || bits === 32)) {
    format = { kind: 'pcm', bits, validBits }
  } else if (formatTag === 3 && (bits === 32 || bits === 64)) {
    format = { kind: 'float', bits }
  } else {
    return null
  }
  if (!channels || !sampleRate || blockAlign !== (channels * bits) / 8) return null

  let truncated = false
  let dataBytes = dataSize
  if (dataBytes === 0 || dataOffset + dataBytes > fileSize) {
    dataBytes = Math.max(0, fileSize - dataOffset)
    truncated = true
  }
  dataBytes = Math.floor(dataBytes / blockAlign) * blockAlign
  return { formatTag, format, channels, sampleRate, blockAlign, fmtChunk: fmt, dataOffset, dataBytes, frames: dataBytes / blockAlign, truncated }
}

/** Decode `frames` interleaved frames from `bytes` into Int16 per channel. */
export function readFrames(bytes: Uint8Array, layout: WavLayout, frames: number): Int16Array[] {
  const { channels, format } = layout
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Int16Array[] = []
  for (let c = 0; c < channels; c++) out.push(new Int16Array(frames))
  const bps = format.bits / 8
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bps
      let v: number
      if (format.kind === 'float') {
        const x = format.bits === 32 ? dv.getFloat32(o, true) : dv.getFloat64(o, true)
        v = Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
      } else if (format.bits === 8) {
        v = (bytes[o]! - 128) << 8
      } else if (format.bits === 16) {
        v = dv.getInt16(o, true)
      } else if (format.bits === 24) {
        v = (bytes[o + 2]! << 24) | (bytes[o + 1]! << 16) | (bytes[o]! << 8)
        v >>= 16
      } else {
        v = dv.getInt32(o, true) >> 16
      }
      out[c]![i] = v
    }
  }
  return out
}

/** The header for a Chop of `frames` frames, the original `fmt ` chunk verbatim. */
export function chopHeader(layout: WavLayout, frames: number): Uint8Array<ArrayBuffer> {
  const bodyBytes = frames * layout.blockAlign
  const pad = bodyBytes & 1
  const needFact = layout.format.kind === 'float'
  const factBytes = needFact ? 12 : 0
  const fmtBytes = layout.fmtChunk.length + (layout.fmtChunk.length & 1)
  const riffSize = 4 + fmtBytes + factBytes + 8 + bodyBytes + pad
  const header = new Uint8Array(12 + fmtBytes + factBytes + 8)
  const dv = new DataView(header.buffer)
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) header[o + i] = s.charCodeAt(i) }
  put(0, 'RIFF'); dv.setUint32(4, riffSize, true); put(8, 'WAVE')
  header.set(layout.fmtChunk, 12)
  let o = 12 + fmtBytes
  if (needFact) {
    put(o, 'fact'); dv.setUint32(o + 4, 4, true); dv.setUint32(o + 8, frames, true)
    o += 12
  }
  put(o, 'data'); dv.setUint32(o + 4, bodyBytes, true)
  return header
}

/** Read `n` bytes at `at` from a Blob. */
async function bytesAt(file: Blob, at: number, n: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(at, at + n).arrayBuffer())
}

export class WavSource implements Source {
  readonly info: SourceInfo
  private level: PeaksLevel | null = null
  private levelReady: Promise<PeaksLevel>

  constructor(private file: File, private layout: WavLayout, opts: OpenOptions = {}) {
    this.info = {
      name: basename(file.name),
      sampleRate: layout.sampleRate,
      channels: layout.channels,
      frames: layout.frames,
      duration: layout.frames / layout.sampleRate,
      origin: 'wav',
      format: layout.format,
      truncated: layout.truncated,
    }
    this.levelReady = this.buildLevel(opts.onProgress)
  }

  /** One streaming pass over the file in ~4 MiB frame-aligned slices. */
  private async buildLevel(onProgress?: (p: number) => void): Promise<PeaksLevel> {
    const { blockAlign, frames } = this.layout
    const level = new PeaksLevel(this.layout.channels, frames)
    const framesPerSlice = Math.max(1, Math.floor((4 << 20) / blockAlign))
    for (let f = 0; f < frames; f += framesPerSlice) {
      const n = Math.min(framesPerSlice, frames - f)
      const bytes = await bytesAt(this.file, this.layout.dataOffset + f * blockAlign, n * blockAlign)
      level.push(readFrames(bytes, this.layout, n), f)
      onProgress?.((f + n) / frames)
    }
    this.level = level
    return level
  }

  async peaks(buckets: number, range?: FrameRange): Promise<Float32Array[]> {
    const r = clampRange(range ?? { start: 0, end: this.info.frames }, this.info.frames)
    const level = this.level ?? (await this.levelReady)
    if ((r.end - r.start) / buckets >= level.framesPerBucket) return level.rebucket(buckets, r)
    return bucketRaw(await this.window(r), buckets)
  }

  async window(range: FrameRange): Promise<Int16Array[]> {
    const r = clampRange(range, this.info.frames)
    const n = Math.max(0, r.end - r.start)
    const { blockAlign, dataOffset } = this.layout
    const bytes = await bytesAt(this.file, dataOffset + r.start * blockAlign, n * blockAlign)
    return readFrames(bytes, this.layout, n)
  }

  async slice(range: FrameRange): Promise<Blob> {
    const r = clampRange(range, this.info.frames)
    const frames = Math.max(0, r.end - r.start)
    const { blockAlign, dataOffset } = this.layout
    const body = this.file.slice(dataOffset + r.start * blockAlign, dataOffset + r.end * blockAlign)
    const parts: BlobPart[] = [chopHeader(this.layout, frames), body]
    if ((frames * blockAlign) & 1) parts.push(new Uint8Array(new ArrayBuffer(1)))
    return new Blob(parts, { type: 'audio/wav' })
  }

  media(): Blob {
    return this.file
  }

  dispose() {
    this.level = null
  }
}

/** Sniff and parse a WAV file's layout, reading forward until the data chunk is found. */
export async function openWav(file: File): Promise<WavLayout | null> {
  let n = 1 << 20
  for (;;) {
    const head = await bytesAt(file, 0, Math.min(n, file.size))
    const r = parseWav(head, file.size)
    if (r !== 'more') return r
    if (n >= file.size || n >= 64 << 20) return null
    n *= 4
  }
}
