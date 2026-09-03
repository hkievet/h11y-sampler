import { useEffect, useReducer, useRef, useState } from 'react'
import {
  initial, keyToAction, reduce, ordered, displayName, filenames, stepFrames, sanitize,
  type State, type Action,
} from './core/chopper'
import { DropZone } from './DropZone'
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
  const [source, setSource] = useState<Source | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
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
      {source
        ? <Editor key={`${source.info.name}:${source.info.frames}`} source={source} />
        : <DropZone onSource={(s, w) => { setSource(s); setWarning(w) }} />}
    </>
  )
}

function Editor({ source }: { source: Source }) {
  const [s, dispatch] = useReducer(
    (st: State, a: Action) => reduce(st, a),
    undefined,
    () => initial(source.info.frames, source.info.name, source.info.sampleRate),
  )
  const stateRef = useRef(s)
  stateRef.current = s

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault() // never scroll the page or move focus
      const a = keyToAction(stateRef.current, toKeyEvent('down', e))
      if (!a) return
      e.preventDefault()
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
  const folder = useRef<FileSystemDirectoryHandle | null>(null) // the Persistence ticket remembers this across reloads
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
          if (!folder.current) folder.current = await pickFolder()
          if (!folder.current) { notify('No folder chosen.'); return }
          if (!(await ensureWritable(folder.current))) { notify('No permission to write to that folder.'); return }
          const names = await writeToFolder(folder.current, source, req.files)
          notify(`Wrote ${names.length - 1} chop${names.length === 2 ? '' : 's'} to ${folder.current.name}/`)
        }
      } catch (e) {
        notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
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
      <StatePanel s={s} />
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
    </div>
  )
}

function Toast({ s }: { s: State }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!s.toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2200)
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
