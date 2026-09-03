import { useRef, useState } from 'react'
import { openSource, WARN_ABOVE_SECONDS, type Source } from './source'

/**
 * The one place a Source enters the app. Drag-and-drop or a file picker;
 * sniffs the bytes and reports progress while peaks are built.
 */
export function DropZone({ onSource }: { onSource: (s: Source, warning: string | null) => void }) {
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function load(file: File) {
    setError(null)
    setProgress(0)
    try {
      const src = await openSource(file, { onProgress: setProgress })
      let warning: string | null = null
      if (src.info.duration > WARN_ABOVE_SECONDS) warning = `${Math.round(src.info.duration / 60)} minutes is past the 60-minute comfort zone; export still works but memory may be tight.`
      if (src.info.truncated) warning = 'The data chunk ran past the end of the file; using what is there.'
      onSource(src, warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProgress(null)
    }
  }

  return (
    <div
      className={'drop' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) void load(f)
      }}
      onClick={() => input.current?.click()}
    >
      {progress == null ? (
        <>
          <div className="big">Drop a recording here</div>
          <div className="note">WAV passes through byte-exact. MP3, FLAC, and M4A are decoded to 16-bit. Nothing leaves this machine. Click to pick a file instead.</div>
          {error && <div className="error">{error}</div>}
        </>
      ) : (
        <div className="big">Reading peaks: {Math.round(progress * 100)}%</div>
      )}
      <input ref={input} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f) }} />
    </div>
  )
}
