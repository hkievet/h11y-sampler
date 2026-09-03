import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildZip, regionsJson, chop } from './export'
import { openSource } from '../source'
import { makeWav, asFile } from '../source/fixtures'
import { parseWav } from '../source/wav'
import { initial, reduce, filenames, type State } from '../core/chopper'

async function fixtureSource() {
  const fx = makeWav({ bits: 24, kind: 'pcm', channels: 2, rate: 48000, frames: 4800, extensible: true, junk: 28 })
  const file = asFile(fx.bytes, 'field.wav')
  return { fx, file, source: await openSource(file) }
}

function withRegions(s: State, regions: { start: number; end: number; name: string | null }[]): State {
  return regions.reduce((st, r) => {
    st = reduce(st, { type: 'seekTo', frame: r.start })
    st = reduce(st, { type: 'insert', first: 'start' })
    st = { ...st, draft: { ...st.draft!, end: r.end } }
    st = reduce(st, { type: 'save', exportAfter: false })
    if (r.name != null) st = reduce(st, { type: 'promptInput', value: r.name })
    return reduce(st, { type: 'promptCommit' })
  }, s)
}

describe('export', () => {
  it('builds a zip whose entries are byte-exact Chops named by the Core, plus regions.json', async () => {
    const { fx, source } = await fixtureSource()
    let s = initial(source.info.frames, source.info.name, source.info.sampleRate)
    s = withRegions(s, [
      { start: 100, end: 600, name: 'kick' },
      { start: 1000, end: 1500, name: null },
      { start: 2000, end: 2400, name: 'snare' },
    ])
    const files = filenames(s, s.regions)
    expect(files.map((f) => f.file)).toEqual(['kick.wav', 'field-01.wav', 'snare.wav'])

    const blob = await buildZip(source, files)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['field-01.wav', 'kick.wav', 'regions.json', 'snare.wav'])

    for (const f of files) {
      const entry = new Uint8Array(await zip.file(f.file)!.async('uint8array'))
      const layout = parseWav(entry, entry.length) as { frames: number; dataOffset: number; fmtChunk: Uint8Array }
      expect(layout.frames).toBe(f.region.end - f.region.start)
      expect(Array.from(layout.fmtChunk)).toEqual(Array.from(fx.fmtChunk))
      const body = entry.subarray(layout.dataOffset)
      const original = fx.bytes.subarray(fx.dataOffset + f.region.start * 6, fx.dataOffset + f.region.end * 6)
      expect(body.length).toBe(original.length)
      expect(body.every((b, i) => b === original[i])).toBe(true)
    }

    const json = JSON.parse(await zip.file('regions.json')!.async('string'))
    expect(json).toEqual(regionsJson(source, files))
    expect(json.source).toMatchObject({ name: 'field', sampleRate: 48000, frames: 4800, fingerprint: { name: 'field.wav' } })
    expect(json.regions[1]).toEqual({ file: 'field-01.wav', name: null, start: 1000, end: 1500 })
    // STORE: the archive is at least as large as its uncompressed entries (JSZip does not report compression on load)
    const entryBytes = (await Promise.all(files.map(async (f) => (await chop(source, f)).size))).reduce((a, b) => a + b, 0)
    expect(blob.size).toBeGreaterThanOrEqual(entryBytes)
  })

  it('a single Chop is exactly what Source.slice returns', async () => {
    const { source } = await fixtureSource()
    let s = initial(source.info.frames, source.info.name, source.info.sampleRate)
    s = withRegions(s, [{ start: 10, end: 20, name: 'x' }])
    const f = filenames(s, s.regions)[0]!
    const a = await (await chop(source, f)).arrayBuffer()
    const b = await (await source.slice({ start: 10, end: 20 })).arrayBuffer()
    expect(new Uint8Array(a)).toEqual(new Uint8Array(b))
  })
})
