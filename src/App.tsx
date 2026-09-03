import { useEffect, useReducer, useRef, useState } from 'react'
import {
  initial, keyToAction, reduce, ordered, displayName, filenames, stepFrames, sanitize,
  type State, type Action,
} from './core/chopper'
import { DropZone, type Opened } from './DropZone'
import { Tutorial } from './tutorial/Tutorial'
import { fingerprintOf, keyOf, sameFile, loadSession, loadSessionByName, saveSession, loadFolder, saveFolder, loadSettings, saveSettings } from './persist/store'
import { Waveform, type PlayCursor } from './view/Waveform'
import { createTransport, type Transport } from './transport/transport'
import { buildZip, chop, download, pickFolder, ensureWritable, writeToFolder } from './export/export'
import type { Source } from './source'

// Shell. Until the waveform, Transport, and export land, this drives the
// Core with the real keys and shows the state; the Source is real.

function fmt(frames: number, sr: number) {
  return (frames / sr).toFixed(3) + 's'
}
function fmtStep(frames: number, sr: number) {
  const ms = (frames / sr) * 1000
  return frames <= 1 ? '1 smp' : ms < 1 ? `${frames} smp` : ms < 1000 ? `${ms.toFixed(ms < 10 ? 1 : 0)} ms` : `${(ms / 1000).toFixed(2)} s`
}

function toKeyEvent(type: 'down' | 'up', e: KeyboardEvent) {
  return { type, code: e.code, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, repeat: e.repeat }
}

export function App() {
  const [opened, setOpened] = useState<Opened | null>(null)
  const source = opened?.source ?? null
  const warning = opened?.warning ?? null
  return (
    <>
      <header>
        <h1>h11y-sampler</h1>
        <p className="note">
          {source
            ? <>{source.info.name} · {source.info.duration.toFixed(1)} s · {source.info.sampleRate} Hz · {source.info.channels} ch · {source.info.origin === 'wav' ? `${source.info.format.bits}-bit ${source.info.format.kind} passthrough` : 'decoded, 16-bit export'}{source.info.truncated ? ' · truncated' : ''}</>
            : <>Keyboard-first sample chopper. Drop a recording to begin.</>}
        </p>
      </header>
      {warning && <div className="toast">{warning}</div>}
      {opened
        ? <Editor key={keyOf(fingerprintOf(opened.file))} opened={opened} />
        : <DropZone onOpen={setOpened} />}
    </>
  )
}

function Editor({ opened }: { opened: Opened }) {
  const source: Source = opened.source
  const [s, dispatch] = useReducer(
    (st: State, a: Action) => reduce(st, a),
    undefined,
    () => {
      const st = initial(source.info.frames, source.info.name, source.info.sampleRate)
      return { ...st, settings: { ...st.settings, ...loadSettings() } }
    },
  )
  const fp = fingerprintOf(opened.file)
  const [tutorial, setTutorial] = useState(opened.file.name === 'demo.wav')

  // ---- Persistence: restore on mount, autosave after ----
  const restored = useRef(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const exact = await loadSession(fp)
      const rec = exact ?? (await loadSessionByName(fp.name))
      if (cancelled) return
      if (rec && rec.regions.length) {
        dispatch({ type: 'restore', regions: rec.regions, nextId: rec.nextId, selected: rec.selected, playhead: rec.playhead, view: rec.view })
        const changed = !sameFile(rec.fingerprint, fp)
        dispatch({ type: 'notify', text: changed
          ? `Restored ${rec.regions.length} region${rec.regions.length === 1 ? '' : 's'}, but the file changed since; marks may not line up.`
          : `Restored ${rec.regions.length} region${rec.regions.length === 1 ? '' : 's'}.` })
      }
      restored.current = true
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!restored.current) return
    const t = setTimeout(() => {
      void saveSession({ fingerprint: fp, handle: opened.handle, regions: s.regions, nextId: s.nextId, selected: s.selected, playhead: s.playhead, view: s.view })
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.regions, s.selected, s.playhead, s.view])
  useEffect(() => { saveSettings(s.settings) }, [s.settings])
  const stateRef = useRef(s)
  stateRef.current = s
  const folder = useRef<FileSystemDirectoryHandle | null>(null)
  const pendingFolder = useRef<Promise<FileSystemDirectoryHandle | null> | null>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault() // never scroll the page or move focus
      if (e.code === 'Slash' && e.shiftKey && !stateRef.current.prompt) { e.preventDefault(); setTutorial((t) => !t); return }
      const a = keyToAction(stateRef.current, toKeyEvent('down', e))
      if (!a) return
      e.preventDefault()
      // Folder export: the picker and the permission re-grant must start inside the gesture,
      // before React gets to the export effect, or Chrome refuses them with NotAllowedError.
      if (a.type === 'exportBatch' && a.to === 'folder' && !pendingFolder.current && stateRef.current.regions.length) {
        const known = folder.current
        pendingFolder.current = known
          ? ensureWritable(known).then((ok) => (ok ? known : null), () => null)
          : pickFolder()
      }
      dispatch(a)
    }
    const up = (e: KeyboardEvent) => {
      const a = keyToAction(stateRef.current, toKeyEvent('up', e))
      if (a) {
        e.preventDefault()
        dispatch(a)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => () => source.dispose(), [source])

  // ---- Transport: driven by the Core's play intents ----
  const transport = useRef<Transport | null>(null)
  useEffect(() => {
    const t = createTransport(source)
    transport.current = t
    const off = t.onEnded(() => dispatch({ type: 'playbackEnded' }))
    return () => {
      off()
      t.dispose()
      transport.current = null
    }
  }, [source])
  useEffect(() => {
    const t = transport.current
    if (!t) return
    const p = s.play
    if (!p) { t.cancel(); return }
    if (p.kind === 'playhead') t.play(p.from)
    else if (p.kind === 'preview') { if (p.hold) void t.previewStart({ start: p.start, end: p.end }); else t.previewRelease() }
    else if (p.kind === 'audition') void t.once({ start: p.start, end: p.end }, 'audition')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.playSeq])
  // build the preview buffer when the Active Region or draft changes, so Space is instant
  const activeRange = s.mode === 'insert' && s.draft ? `${s.draft.start}:${s.draft.end}`
    : s.mode === 'select' && s.activeId != null ? (() => { const r = s.regions.find((x) => x.id === s.activeId); return r ? `${r.start}:${r.end}` : '' })() : ''
  useEffect(() => {
    if (!activeRange) return
    const [a, b] = activeRange.split(':').map(Number)
    transport.current?.prepare({ start: a!, end: b! })
  }, [activeRange])
  // ---- Export: driven by the Core's export intents ----
  useEffect(() => { void loadFolder().then((h) => { folder.current = h }) }, [])
  useEffect(() => {
    const req = s.exportReq
    if (!req || s.exportSeq === 0) return
    const notify = (text: string) => dispatch({ type: 'notify', text })
    void (async () => {
      try {
        if (req.kind === 'one') {
          const f = req.files[0]!
          download(await chop(source, f), f.file)
          notify(`Exported ${f.file}`)
        } else if (req.kind === 'zip') {
          download(await buildZip(source, req.files), req.zip!)
          notify(`Exported ${req.files.length} chop${req.files.length === 1 ? '' : 's'} to ${req.zip}`)
        } else {
          const hadFolder = !!folder.current
          const pending = pendingFolder.current ?? (folder.current ? ensureWritable(folder.current).then((ok) => (ok ? folder.current : null)) : pickFolder())
          pendingFolder.current = null
          const dir = await pending
          if (!dir) {
            folder.current = null // a refused or stale folder is forgotten so the next press opens the picker
            notify(hadFolder ? 'Chrome refused access to the saved folder. Press Cmd+Shift+E again to pick one.' : 'Folder picker cancelled. Cmd+E makes a zip instead.')
            return
          }
          folder.current = dir
          void saveFolder(dir)
          const names = await writeToFolder(dir, source, req.files)
          notify(`Wrote ${names.length - 1} chop${names.length === 2 ? '' : 's'} and regions.json to ${dir.name}/`)
        }
      } catch (e) {
        pendingFolder.current = null
        notify(`Export failed: ${e instanceof DOMException ? `${e.name}: ${e.message}` : e instanceof Error ? e.message : String(e)}`)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.exportSeq])

  const playCursor = (): PlayCursor => {
    const t = transport.current
    const kind = t?.cursorKind()
    const frame = t?.position()
    return kind && frame != null ? { frame, kind } : null
  }

  return (
    <>
      <Waveform source={source} s={s} dispatch={dispatch} playCursor={playCursor} />
      <StatusBar s={s} />
      <Toast s={s} />
      <div className={'cols' + (tutorial ? ' with-tutorial' : '')}>
        <StatePanel s={s} />
        {tutorial && <Tutorial onClose={() => setTutorial(false)} />}
      </div>
      {s.prompt && <Prompt s={s} dispatch={dispatch} />}
    </>
  )
}

function StatusBar({ s }: { s: State }) {
  const modeLabel = { playhead: 'PLAYHEAD', insert: 'INSERT REGION', select: 'REGION SELECT' }[s.mode]
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (!s.shake) return
    setShaking(true)
    const t = setTimeout(() => setShaking(false), 300)
    return () => clearTimeout(t)
  }, [s.shake])
  return (
    <div className={'status' + (shaking ? ' shake' : '')}>
      <span className={'mode ' + s.mode}>{modeLabel}</span>
      <span>playhead <b>{fmt(s.playhead, s.sr)}</b></span>
      <span>
        step h/l <b>{fmtStep(stepFrames(s, 'plain'), s.sr)}</b> · H/L <b>{fmtStep(stepFrames(s, 'fine'), s.sr)}</b> · opt+h/l{' '}
        <b>{fmtStep(stepFrames(s, 'coarse'), s.sr)}</b>
      </span>
      <span>zoom <b>{(s.view.win / s.sr).toFixed(3)}s</b> across</span>
      <span>regions <b>{s.regions.length}</b> · selected <b>{s.selected.length}</b></span>
      <span>{s.play ? <b>playing {s.play.kind}{s.play.kind === 'preview' ? (s.play.hold ? ' (held, looping)' : ' (released)') : ''}</b> : 'stopped'}</span>
      <span className="note"><kbd>?</kbd> tutorial</span>
    </div>
  )
}

function Toast({ s }: { s: State }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!s.toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), s.toast.text.length > 40 ? 6000 : 2200)
    return () => clearTimeout(t)
  }, [s.toast])
  if (!visible || !s.toast) return null
  return <div className="toast">{s.toast.text}</div>
}

function StatePanel({ s }: { s: State }) {
  const d = s.draft
  const active = s.activeId != null ? s.regions.find((r) => r.id === s.activeId) : undefined
  const files = filenames(s, s.regions)
  return (
    <div className="panel">
      <h2>Current state</h2>
      <dl>
        <dt>Mode</dt><dd>{s.mode}</dd>
        <dt>Playhead</dt><dd>{fmt(s.playhead, s.sr)} (frame {s.playhead})</dd>
        <dt>Return point</dt><dd>{s.returnPoint == null ? '-' : fmt(s.returnPoint, s.sr)}</dd>
        <dt>Playing</dt><dd>{s.play ? `${s.play.kind}${'start' in s.play ? ` ${fmt(s.play.start, s.sr)} to ${fmt(s.play.end, s.sr)}` : ''}` : '-'}</dd>
        <dt>Draft</dt>
        <dd>{d ? <>start {fmt(d.start, s.sr)} · end {fmt(d.end, s.sr)} · active <b>{d.active}</b>{d.editingId != null ? ` · editing #${d.editingId}` : ''}</> : '-'}</dd>
        <dt>Active region</dt><dd>{active ? displayName(s, active) : '-'}</dd>
        <dt>Selected</dt><dd>{s.selected.length ? s.selected.map((id) => displayName(s, s.regions.find((r) => r.id === id)!)).join(', ') : '-'}</dd>
        <dt>Undo / redo</dt><dd>{s.undo.length} / {s.redo.length}</dd>
        <dt>Last action</dt><dd>{s.lastChange}</dd>
        <dt>Export request</dt><dd>{s.exportReq ? `${s.exportReq.kind}: ${s.exportReq.files.map((f) => f.file).join(', ')}` : '-'}</dd>
      </dl>
      <table>
        <thead>
          <tr><th>#</th><th>name</th><th>start to end</th><th>len</th><th>export filename</th></tr>
        </thead>
        <tbody>
          {ordered(s).map((r, i) => {
            const f = files.find((x) => x.region.id === r.id)!
            return (
              <tr key={r.id} className={r.id === s.activeId && s.mode === 'select' ? 'active' : ''}>
                <td>{i}</td>
                <td>{s.selected.includes(r.id) ? '[x] ' : ''}{displayName(s, r)}{r.name == null ? <span className="note"> (auto)</span> : null}</td>
                <td>{fmt(r.start, s.sr)} {fmt(r.end, s.sr)}</td>
                <td>{((r.end - r.start) / s.sr).toFixed(3)}s</td>
                <td className={f.collided ? 'collision' : ''}>{f.file}{f.collided ? ' (collision)' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Prompt({ s, dispatch }: { s: State; dispatch: (a: Action) => void }) {
  const p = s.prompt!
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const typed = p.value.trim()
  const clean = sanitize(typed)
  const preview =
    typed === '' ? `empty: automatic name ${p.def}.wav`
    : typed === p.def ? 'automatic name; renumbers by position at export'
    : clean !== typed ? `will export as ${clean || p.def}.wav`
    : ''
  return (
    <div className="prompt">
      <div className="box">
        <label>{p.forDraft ? (p.exportAfter ? 'Name this region, then it saves and exports' : 'Name this region (the name is the filename)') : 'Rename region'}</label>
        <input
          ref={ref}
          value={p.value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => dispatch({ type: 'promptInput', value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); dispatch({ type: 'promptCommit' }) }
            else if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'promptCancel' }) }
            e.stopPropagation()
          }}
        />
        <div className="preview">{preview}</div>
        <div className="hint">Enter saves · Esc discards the region · Enter on the untouched default keeps the name automatic</div>
      </div>
    </div>
  )
}
