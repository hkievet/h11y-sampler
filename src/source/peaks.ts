import type { FrameRange } from './types'

/**
 * A min/max pyramid level: per channel, per bucket of `framesPerBucket`
 * frames, the Int16 min and max. Built once in a streaming pass; any zoom
 * coarser than the bucket size is a cheap re-bucket of this level.
 */
export class PeaksLevel {
  readonly framesPerBucket: number
  readonly min: Int16Array[]
  readonly max: Int16Array[]
  readonly buckets: number

  constructor(channels: number, frames: number, framesPerBucket = 64) {
    this.framesPerBucket = framesPerBucket
    this.buckets = Math.max(1, Math.ceil(frames / framesPerBucket))
    this.min = []
    this.max = []
    for (let c = 0; c < channels; c++) {
      this.min.push(new Int16Array(this.buckets).fill(32767))
      this.max.push(new Int16Array(this.buckets).fill(-32768))
    }
  }

  /** Fold deinterleaved Int16 frames starting at `frameOffset` into the level. */
  push(chans: Int16Array[], frameOffset: number) {
    const fpb = this.framesPerBucket
    for (let c = 0; c < chans.length; c++) {
      const data = chans[c]!
      const mn = this.min[c]!
      const mx = this.max[c]!
      for (let i = 0; i < data.length; i++) {
        const b = Math.floor((frameOffset + i) / fpb)
        const v = data[i]!
        if (v < mn[b]!) mn[b] = v
        if (v > mx[b]!) mx[b] = v
      }
    }
  }

  /** Max magnitude in 0..1 per output bucket over `range`, re-bucketed from this level. */
  rebucket(buckets: number, range: FrameRange): Float32Array[] {
    const fpb = this.framesPerBucket
    const span = range.end - range.start
    return this.min.map((mn, c) => {
      const mx = this.max[c]!
      const out = new Float32Array(buckets)
      for (let i = 0; i < buckets; i++) {
        const f0 = range.start + (i * span) / buckets
        const f1 = range.start + ((i + 1) * span) / buckets
        const b0 = Math.floor(f0 / fpb)
        const b1 = Math.max(b0, Math.ceil(f1 / fpb) - 1)
        let m = 0
        for (let b = b0; b <= b1 && b < this.buckets; b++) {
          const a = Math.abs(mn[b]!)
          const z = Math.abs(mx[b]!)
          if (mn[b]! <= mx[b]!) {
            if (a > m) m = a
            if (z > m) m = z
          }
        }
        out[i] = m / 32768
      }
      return out
    })
  }
}

/** Max magnitude per bucket straight from raw frames (for zooms finer than the level). */
export function bucketRaw(chans: Int16Array[], buckets: number): Float32Array[] {
  return chans.map((data) => {
    const out = new Float32Array(buckets)
    const n = data.length
    for (let i = 0; i < buckets; i++) {
      const a = Math.floor((i * n) / buckets)
      const b = Math.max(a + 1, Math.floor(((i + 1) * n) / buckets))
      let m = 0
      for (let j = a; j < b && j < n; j++) {
        const v = Math.abs(data[j]!)
        if (v > m) m = v
      }
      out[i] = m / 32768
    }
    return out
  })
}
