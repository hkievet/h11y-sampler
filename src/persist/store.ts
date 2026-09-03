/**
 * Persistence: per-Source session records in IndexedDB, keyed by a file
 * fingerprint, plus the export folder handle and settings. Hand-rolled
 * IndexedDB (no dependency), no React. FileSystemHandles are structured
 * cloneable, so a reload can reopen the Source after one permission prompt.
 */
import type { Region, Settings } from '../core/chopper'

export interface Fingerprint {
  name: string
  size: number
  lastModified: number
}

export interface SessionRecord {
  key: string
  fingerprint: Fingerprint
  handle: FileSystemFileHandle | null
  regions: Region[]
  nextId: number
  selected: number[]
  playhead: number
  view: { win: number; start: number }
  savedAt: number
}

const DB = 'h11y-sampler'
const STORE = 'kv'
const RECENT_MAX = 20
const SETTINGS_KEY = 'h11y-sampler:settings'

export function fingerprintOf(file: File): Fingerprint {
  return { name: file.name, size: file.size, lastModified: file.lastModified }
}
export const keyOf = (f: Fingerprint) => `src:${f.name}|${f.size}|${f.lastModified}`
export const sameFile = (a: Fingerprint, b: Fingerprint) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

// ---------- tiny IndexedDB key-value ----------

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}
const get = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
const set = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key))
const del = (key: string) => tx('readwrite', (s) => s.delete(key))

// ---------- sessions ----------

export async function loadSession(fp: Fingerprint): Promise<SessionRecord | null> {
  return (await get<SessionRecord>(keyOf(fp))) ?? null
}

/** The most recent session for a file of this name, when the exact fingerprint has no record. */
export async function loadSessionByName(name: string): Promise<SessionRecord | null> {
  const recent = (await get<string[]>('recent')) ?? []
  for (const key of recent) {
    const rec = await get<SessionRecord>(key)
    if (rec && rec.fingerprint.name === name) return rec
  }
  return null
}

export async function saveSession(rec: Omit<SessionRecord, 'key' | 'savedAt'>): Promise<void> {
  const key = keyOf(rec.fingerprint)
  await set(key, { ...rec, key, savedAt: Date.now() })
  const recent = ((await get<string[]>('recent')) ?? []).filter((k) => k !== key)
  recent.unshift(key)
  for (const stale of recent.splice(RECENT_MAX)) await del(stale)
  await set('recent', recent)
}

/** The most recent session, for the "Press Enter to reopen" offer. */
export async function mostRecentSession(): Promise<SessionRecord | null> {
  const recent = (await get<string[]>('recent')) ?? []
  const key = recent[0]
  return key ? ((await get<SessionRecord>(key)) ?? null) : null
}

/** Reopen a stored handle: one permission prompt, then the File. Null when refused or gone. */
export async function reopenHandle(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    const q = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted'
    if (q !== 'granted') {
      const r = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied'
      if (r !== 'granted') return null
    }
    return await handle.getFile()
  } catch {
    return null
  }
}

// ---------- export folder ----------

export const loadFolder = () => get<FileSystemDirectoryHandle>('folder').then((h) => h ?? null)
export const saveFolder = (h: FileSystemDirectoryHandle) => set('folder', h)

// ---------- settings (localStorage) ----------

export function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {}
  } catch {
    return {}
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* private mode or quota: settings simply do not persist */
  }
}
