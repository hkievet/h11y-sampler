/**
 * Export: turns an ExportReq from the Core into files. Names come only from
 * the Core's `filenames`; bytes come only from `Source.slice`. Three sinks:
 * a single WAV download, a zip download, and a folder write through the
 * File System Access API. No React.
 */
import JSZip from 'jszip'
import type { ExportFile } from '../core/chopper'
import type { Source } from '../source'

export interface RegionsJson {
  source: { name: string; fingerprint: { name: string; size: number; lastModified: number }; sampleRate: number; frames: number }
  regions: { file: string; name: string | null; start: number; end: number }[]
}

export function fingerprintOf(file: Blob): RegionsJson['source']['fingerprint'] {
  const f = file as File
  return { name: f.name ?? '', size: file.size, lastModified: f.lastModified ?? 0 }
}

export function regionsJson(source: Source, files: ExportFile[]): RegionsJson {
  return {
    source: { name: source.info.name, fingerprint: fingerprintOf(source.media()), sampleRate: source.info.sampleRate, frames: source.info.frames },
    regions: files.map((f) => ({ file: f.file, name: f.region.name, start: f.region.start, end: f.region.end })),
  }
}

/** One Chop as a WAV Blob. */
export async function chop(source: Source, f: ExportFile): Promise<Blob> {
  return source.slice({ start: f.region.start, end: f.region.end })
}

/** The zip: every Chop stored uncompressed plus regions.json. */
export async function buildZip(source: Source, files: ExportFile[]): Promise<Blob> {
  const zip = new JSZip()
  // ArrayBuffer rather than Blob: JSZip buffers either way, and node's Blob is not recognised
  for (const f of files) zip.file(f.file, await (await chop(source, f)).arrayBuffer(), { binary: true })
  zip.file('regions.json', JSON.stringify(regionsJson(source, files), null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true })
}

/** Trigger a browser download. */
export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** Write every Chop plus regions.json into a picked folder. Returns the names written. */
export async function writeToFolder(dir: FileSystemDirectoryHandle, source: Source, files: ExportFile[]): Promise<string[]> {
  const written: string[] = []
  const put = async (name: string, blob: Blob) => {
    const h = await dir.getFileHandle(name, { create: true })
    const w = await h.createWritable()
    await w.write(blob)
    await w.close()
    written.push(name)
  }
  for (const f of files) await put(f.file, await chop(source, f))
  await put('regions.json', new Blob([JSON.stringify(regionsJson(source, files), null, 2)], { type: 'application/json' }))
  return written
}

/** Ask once for a folder with write access. The Persistence ticket remembers the handle. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) return null
  try {
    return await window.showDirectoryPicker({ id: 'h11y-chops', mode: 'readwrite' })
  } catch {
    return null // the user cancelled
  }
}

/** Ensure a remembered handle is still writable, prompting if needed. */
export async function ensureWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const q = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  if (q === 'granted') return true
  const r = (await dir.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
  return r === 'granted'
}
