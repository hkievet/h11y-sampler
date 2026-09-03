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

/**
 * Ask for a folder with write access. Must be called synchronously inside a
 * user-gesture handler (a keydown): Chrome refuses the picker with
 * NotAllowedError once the gesture has passed. Resolves null when the user
 * cancels; any other failure is rethrown so the Shell can say why.
 */
export function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) return Promise.reject(new Error('This browser has no folder picker; use Cmd+E for a zip.'))
  return window.showDirectoryPicker({ id: 'h11y-chops', mode: 'readwrite', startIn: 'downloads' }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  })
}

/**
 * Ensure a remembered handle is still writable, prompting if needed. Like the
 * picker, the prompt only works inside a user gesture; call it from the key
 * handler. The query is skipped so the request starts synchronously.
 */
export function ensureWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if (!dir.requestPermission) return Promise.resolve(true)
  return dir.requestPermission({ mode: 'readwrite' }).then((r) => r === 'granted', () => false)
}
