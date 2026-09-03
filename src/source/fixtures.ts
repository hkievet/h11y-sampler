/** WAV fixture generator shared by the Source and Export tests (and Seam A later). Test helper, not shipped. */

// ---------- fixture generator: the same shapes Seam A will drop into Chromium ----------

export interface Fixture {
  bits: 8 | 16 | 24 | 32
  kind: 'pcm' | 'float'
  channels: number
  rate: number
  frames: number
  extensible?: boolean
  /** put a JUNK chunk before fmt, like field recorders do */
  junk?: number
  /** claim this many data bytes in the header regardless of the truth */
  claimDataBytes?: number
  /** RF64 with a ds64 chunk carrying the data size */
  rf64?: boolean
  /** an odd-sized chunk before data, to exercise pad bytes */
  oddChunk?: boolean
}

export const put = (u8: Uint8Array, o: number, s: string) => { for (let i = 0; i < s.length; i++) u8[o + i] = s.charCodeAt(i) }

/** deterministic sample values in -1..1 per (frame, channel) */
const sampleValue = (i: number, c: number) => Math.sin(i * 0.05 + c) * (0.9 - c * 0.2)

export function makeWav(fx: Fixture): { bytes: Uint8Array<ArrayBuffer>; expected: Int16Array[]; fmtChunk: Uint8Array; dataOffset: number } {
  const bps = fx.bits / 8
  const blockAlign = fx.channels * bps
  const dataBytes = fx.frames * blockAlign
  const fmtSize = fx.extensible ? 40 : fx.kind === 'float' ? 18 : 16
  const fmt = new Uint8Array(8 + fmtSize)
  const fdv = new DataView(fmt.buffer)
  put(fmt, 0, 'fmt '); fdv.setUint32(4, fmtSize, true)
  fdv.setUint16(8, fx.extensible ? 0xfffe : fx.kind === 'float' ? 3 : 1, true)
  fdv.setUint16(10, fx.channels, true)
  fdv.setUint32(12, fx.rate, true)
  fdv.setUint32(16, fx.rate * blockAlign, true)
  fdv.setUint16(20, blockAlign, true)
  fdv.setUint16(22, fx.bits, true)
  if (fmtSize >= 18) fdv.setUint16(24, fmtSize - 18, true)
  if (fx.extensible) {
    fdv.setUint16(26, fx.bits, true) // valid bits
    fdv.setUint32(28, 0, true) // channel mask
    fdv.setUint16(32, fx.kind === 'float' ? 3 : 1, true)
    fmt.set([0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71], 34)
  }
  const chunks: Uint8Array[] = []
  if (fx.junk) {
    const j = new Uint8Array(8 + fx.junk)
    put(j, 0, 'JUNK'); new DataView(j.buffer).setUint32(4, fx.junk, true)
    chunks.push(j)
  }
  chunks.push(fmt)
  if (fx.oddChunk) {
    const o = new Uint8Array(8 + 5 + 1) // 5 data bytes plus pad
    put(o, 0, 'bext'); new DataView(o.buffer).setUint32(4, 5, true)
    chunks.push(o)
  }
  const data = new Uint8Array(8 + dataBytes)
  const ddv = new DataView(data.buffer)
  put(data, 0, 'data')
  ddv.setUint32(4, fx.rf64 ? 0xffffffff : (fx.claimDataBytes ?? dataBytes), true)
  const expected: Int16Array[] = []
  for (let c = 0; c < fx.channels; c++) expected.push(new Int16Array(fx.frames))
  for (let i = 0; i < fx.frames; i++) {
    for (let c = 0; c < fx.channels; c++) {
      const x = sampleValue(i, c)
      const o = 8 + (i * fx.channels + c) * bps
      let v16: number
      if (fx.kind === 'float') {
        if (fx.bits === 32) ddv.setFloat32(o, x, true); else ddv.setFloat64(o, x, true)
        v16 = Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
      } else if (fx.bits === 8) {
        const v = Math.round(x * 127) + 128
        data[o] = v
        v16 = (v - 128) << 8
      } else if (fx.bits === 16) {
        v16 = Math.round(x * 32767); ddv.setInt16(o, v16, true)
      } else if (fx.bits === 24) {
        const v = Math.round(x * 8388607)
        data[o] = v & 0xff; data[o + 1] = (v >> 8) & 0xff; data[o + 2] = (v >> 16) & 0xff
        v16 = v >> 8
      } else {
        const v = Math.round(x * 2147483647); ddv.setInt32(o, v, true)
        v16 = v >> 16
      }
      expected[c]![i] = v16
    }
  }
  chunks.push(data)
  if (fx.rf64) {
    const ds = new Uint8Array(8 + 28)
    put(ds, 0, 'ds64'); const d = new DataView(ds.buffer)
    d.setUint32(4, 28, true)
    d.setUint32(16, dataBytes, true) // dataSizeLow
    d.setUint32(20, 0, true) // dataSizeHigh
    chunks.unshift(ds)
  }
  const total = 12 + chunks.reduce((n, c) => n + c.length, 0)
  const bytes = new Uint8Array(total)
  const dv = new DataView(bytes.buffer)
  put(bytes, 0, fx.rf64 ? 'RF64' : 'RIFF'); dv.setUint32(4, fx.rf64 ? 0xffffffff : total - 8, true); put(bytes, 8, 'WAVE')
  let o = 12
  let dataOffset = -1
  for (const c of chunks) {
    if (String.fromCharCode(...c.subarray(0, 4)) === 'data') dataOffset = o + 8
    bytes.set(c, o)
    o += c.length
  }
  return { bytes, expected, fmtChunk: fmt, dataOffset }
}

export const asFile = (bytes: Uint8Array<ArrayBuffer>, name = 'take.wav') => new File([bytes], name, { type: 'audio/wav' })
