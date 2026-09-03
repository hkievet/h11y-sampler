import { useEffect, useRef, useState } from 'react'
import { openSource, WARN_ABOVE_SECONDS, type Source } from './source'
import { mostRecentSession, reopenHandle, type SessionRecord } from './persist/store'
import { demoFile } from './source/demo'

export interface Opened {
  source: Source
  file: File
  /** the dropped file's handle when the browser provides one; lets a reload reopen it */
  handle: FileSystemFileHandle | null
  warning: string | null
}

/**
 * The one place a Source enters the app: drag-and-drop, a file picker, or
 * the "Press Enter to reopen" offer for the most recent session.
 */
export function DropZone({ onOpen }: { onOpen: (o: Opened) => void }) {
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<SessionRecord | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void mostRecentSession().then((r) => { if (r?.handle) setRecent(r) })
  }, [])

  async function load(file: File, handle: FileSystemFileHandle | null) {
    setError(null)
    setProgress(0)
    try {
      const source = await openSource(file, { onProgress: setProgress })
      let warning: string | null = null
      if (source.info.duration > WARN_ABOVE_SECONDS) warning = `${Math.round(source.info.duration / 60)} minutes is past the 60-minute comfort zone; export still works but memory may be tight.`
      if (source.info.truncated) warning = 'The data chunk ran past the end of the file; using what is there.'
      onOpen({ source, file, handle, warning })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProgress(null)
    }
  }

  async function reopen() {
    if (!recent?.handle) return
    const file = await reopenHandle(recent.handle)
    if (!file) { setError(`Could not reopen ${recent.fingerprint.name}. Drop it again.`); setRecent(null); return }
    await load(file, recent.handle)
  }

  useEffect(() => {
    if (!recent) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && progress == null) { e.preventDefault(); void reopen() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent, progress])

  return (
    <div
      className={'drop' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const item = e.dataTransfer.items[0]
        const f = e.dataTransfer.files[0]
        if (!f) return
        const handlePromise = item?.getAsFileSystemHandle ? item.getAsFileSystemHandle() : Promise.resolve(null)
        void handlePromise.then((h) => load(f, h && h.kind === 'file' ? (h as FileSystemFileHandle) : null), () => load(f, null))
      }}
      onClick={() => input.current?.click()}
    >
      {progress == null ? (
        <>
          <div className="big">Drop a recording here</div>
          <div className="note">WAV passes through byte-exact. MP3, FLAC, and M4A are decoded to 16-bit. Nothing leaves this machine. Click to pick a file instead.</div>
          <div className="demo" onClick={(e) => { e.stopPropagation(); void load(demoFile(), null) }}>
            Or try the <b>demo recording</b> with the tutorial
          </div>
          {recent && (
            <div className="reopen" onClick={(e) => { e.stopPropagation(); void reopen() }}>
              Press <kbd>Enter</kbd> to reopen <b>{recent.fingerprint.name}</b> with its {recent.regions.length} region{recent.regions.length === 1 ? '' : 's'}
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </>
      ) : (
        <div className="big">Reading peaks: {Math.round(progress * 100)}%</div>
      )}
      <input ref={input} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f, null) }} />
    </div>
  )
}
