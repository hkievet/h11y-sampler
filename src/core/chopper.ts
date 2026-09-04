/**
 * Core: the state machine and keymap for h11y-sampler.
 *
 * Pure. No DOM, no audio, no React. Ported from
 * /prototypes/keymap-prototype.html (the first script block), which is
 * the primary source for every rule here. Frames are the unit of truth.
 *
 * Two entry points: `keyToAction(state, keyEvent)` turns a key into an
 * action or null; `reduce(state, action)` returns the next state. `play`
 * and `exportReq` are intents: the Shell watches `playSeq` / `exportSeq`
 * and drives Transport and Export. The Core never calls them.
 */

export type Mode = 'playhead' | 'insert' | 'select'
export type Side = 'start' | 'end'

export interface Region {
  id: number
  start: number
  end: number
  /** null means automatic: `<basename>-<index>`, renumbered by position */
  name: string | null
}

export interface Draft {
  start: number
  end: number
  active: Side
  editingId: number | null
}

export interface Prompt {
  value: string
  def: string
  forDraft: boolean
  regionId: number | null
  exportAfter: boolean
  /** set when the last commit was refused; cleared on the next keystroke */
  error?: string
}

export type Play =
  | { kind: 'playhead'; from: number }
  | { kind: 'preview'; start: number; end: number; hold: boolean }
  | { kind: 'audition'; start: number; end: number; side: Side }

export interface ExportFile {
  region: Region
  file: string
  collided: boolean
}

export interface ExportReq {
  kind: 'one' | 'zip' | 'folder'
  files: ExportFile[]
  zip?: string
}

export interface Settings {
  /** plain step as % of the visible window */
  plainPct: number
  /** coarse step as % of the visible window */
  coarsePct: number
  fine: '1px' | '1sample' | '1ms' | '10ms'
  auditionMs: number
  /** gap between the anchors on insert, as % of the visible window */
  gapPct: number
  tapMs: number
}

export interface State {
  frames: number
  basename: string
  sr: number
  mode: Mode
  playhead: number
  returnPoint: number | null
  regions: Region[]
  nextId: number
  draft: Draft | null
  activeId: number | null
  selected: number[]
  view: { win: number; start: number }
  /** canvas width in px, supplied by the Shell; the fine step is one pixel */
  viewPx: number
  undo: Region[][]
  redo: Region[][]
  settings: Settings
  toast: { text: string; seq: number } | null
  shake: number
  prompt: Prompt | null
  play: Play | null
  playSeq: number
  exportReq: ExportReq | null
  exportSeq: number
  lastChange: string
}

export interface KeyEvent {
  type: 'down' | 'up'
  code: string
  shift: boolean
  alt: boolean
  meta: boolean
  ctrl: boolean
  repeat: boolean
}

export type StepSize = 'plain' | 'fine' | 'coarse'

export type Action =
  | { type: 'setSetting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'setViewPx'; px: number }
  | { type: 'scrub'; dir: -1 | 1; size: StepSize }
  | { type: 'seekTo'; frame: number }
  | { type: 'zoom'; kind: 'in' | 'out' | 'second' | 'fit' }
  | { type: 'playToggle' }
  | { type: 'stop' }
  | { type: 'playbackEnded' }
  | { type: 'insert'; first: Side }
  | { type: 'anchor' }
  | { type: 'save'; exportAfter: boolean }
  | { type: 'cancel' }
  | { type: 'audition' }
  | { type: 'auditionPlayhead'; side: Side }
  | { type: 'previewDown' }
  | { type: 'previewUp' }
  | { type: 'promptInput'; value: string }
  | { type: 'promptCommit' }
  | { type: 'promptCancel' }
  | { type: 'tab' }
  | { type: 'cycle'; dir: -1 | 1 }
  | { type: 'pick'; id: number }
  | { type: 'edit' }
  | { type: 'toggleSelect' }
  | { type: 'selectAll' }
  | { type: 'clearSelect' }
  | { type: 'toPlayhead'; at: Side }
  | { type: 'delete' }
  | { type: 'rename' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'exportOne' }
  | { type: 'exportBatch'; to: 'zip' | 'folder' }
  | { type: 'notify'; text: string }
  | { type: 'restore'; regions: Region[]; nextId: number; selected: number[]; playhead: number; view: { win: number; start: number } }

export const DEFAULT_SETTINGS: Settings = {
  plainPct: 1,
  coarsePct: 10,
  fine: '1px',
  auditionMs: 300,
  gapPct: 20,
  tapMs: 200,
}

export function initial(frames: number, basename: string, sr: number): State {
  return {
    frames,
    basename,
    sr,
    mode: 'playhead',
    playhead: 0,
    returnPoint: null,
    regions: [],
    nextId: 1,
    draft: null,
    activeId: null,
    selected: [],
    view: { win: frames, start: 0 },
    viewPx: 1000,
    undo: [],
    redo: [],
    settings: { ...DEFAULT_SETTINGS },
    toast: null,
    shake: 0,
    prompt: null,
    play: null,
    playSeq: 0,
    exportReq: null,
    exportSeq: 0,
    lastChange: '',
  }
}

// ---------- helpers ----------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const byStart = (a: Region, b: Region) => a.start - b.start || a.end - b.end

export const ordered = (s: State): Region[] => [...s.regions].sort(byStart)
const find = (s: State, id: number | null): Region | null =>
  id == null ? null : (s.regions.find((r) => r.id === id) ?? null)

let toastSeq = 0
const toast = (s: State, text: string): State => ({ ...s, toast: { text, seq: ++toastSeq } })

export function stepFrames(s: State, size: StepSize): number {
  const { plainPct, coarsePct, fine } = s.settings
  const win = s.view.win
  if (size === 'plain') return Math.max(1, Math.round((win * plainPct) / 100))
  if (size === 'coarse') return Math.max(1, Math.round((win * coarsePct) / 100))
  if (fine === '1px') return Math.max(1, Math.round(win / Math.max(1, s.viewPx)))
  if (fine === '1sample') return 1
  if (fine === '10ms') return Math.max(1, Math.round(s.sr / 100))
  return Math.max(1, Math.round(s.sr / 1000))
}

/** The frame the view keeps in sight: active Anchor, Active Region start, or Playhead. */
export function focusFrame(s: State): number {
  if (s.mode === 'insert' && s.draft) return s.draft[s.draft.active]
  if (s.mode === 'select' && s.activeId != null) {
    const r = find(s, s.activeId)
    if (r) return r.start
  }
  return s.playhead
}

function keepVisible(s: State): State {
  const f = focusFrame(s)
  const { win } = s.view
  let start = s.view.start
  if (f < start || f > start + win) start = f - win / 2
  start = clamp(Math.round(start), 0, Math.max(0, s.frames - win))
  return start === s.view.start ? s : { ...s, view: { ...s.view, start } }
}

function centerOn(s: State, win: number): State {
  win = clamp(Math.round(win), 64, s.frames)
  const f = focusFrame(s)
  const start = clamp(Math.round(f - win / 2), 0, Math.max(0, s.frames - win))
  return { ...s, view: { win, start } }
}

const pushUndo = (s: State): State => ({ ...s, undo: [...s.undo, s.regions].slice(-50), redo: [] })

const defaultIndex = (s: State, region: Region): number => ordered(s).findIndex((r) => r.id === region.id)

export function pad(n: number, count: number): string {
  const w = Math.max(2, String(Math.max(0, count - 1)).length)
  return String(n).padStart(w, '0')
}

export function displayName(s: State, r: Region): string {
  return r.name != null ? r.name : `${s.basename}-${defaultIndex(s, r)}`
}

const dist = (r: Region, f: number) => (f < r.start ? r.start - f : f > r.end ? f - r.end : 0)

const stopAll = (s: State): State =>
  s.play ? { ...s, play: null, playSeq: s.playSeq + 1, returnPoint: null } : s

function fixActive(n: State): State {
  if (n.activeId != null && !find(n, n.activeId)) {
    const list = ordered(n)
    if (!list.length) {
      return { ...n, activeId: null, selected: [], mode: n.mode === 'select' ? 'playhead' : n.mode }
    }
    n = { ...n, activeId: list[0]!.id }
  }
  return { ...n, selected: n.selected.filter((id) => find(n, id)) }
}

function audition(s: State, frame: number, side: Side): State {
  const w = Math.round((s.settings.auditionMs / 1000) * s.sr)
  const range =
    side === 'start'
      ? { start: frame, end: Math.min(s.frames, frame + w) }
      : { start: Math.max(0, frame - w), end: frame }
  if (range.end <= range.start) return s
  return { ...s, play: { kind: 'audition', ...range, side }, playSeq: s.playSeq + 1 }
}

// ---------- filename rules ----------

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function sanitize(name: string): string {
  let n = name.normalize('NFC')
  // eslint-disable-next-line no-control-regex
  n = n.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
  n = n.replace(/\s+/g, ' ').trim()
  n = n.replace(/^[. ]+|[. ]+$/g, '')
  if (RESERVED.test(n)) n += '_'
  if (n.length > 120) n = n.slice(0, 120)
  if (/\.wav$/i.test(n)) n = n.slice(0, -4)
  return n
}

/** Export filenames for `regions`, with collisions resolved over ALL regions in start order. */
export function filenames(s: State, regions: Region[]): ExportFile[] {
  const all = ordered(s)
  const wanted = new Set(regions.map((r) => r.id))
  const seen = new Map<string, number>()
  const out: ExportFile[] = []
  all.forEach((r, i) => {
    let base = r.name != null ? sanitize(r.name) : ''
    if (!base) base = `${s.basename}-${pad(i, all.length)}`
    const key = base.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const file = (n > 1 ? `${base} (${n})` : base) + '.wav'
    if (wanted.has(r.id)) out.push({ region: r, file, collided: n > 1 })
  })
  return out
}

// ---------- keymap ----------

export function keyToAction(s: State, ev: KeyEvent): Action | null {
  const { code, shift, alt, meta, ctrl, repeat } = ev
  if (s.prompt) return null // the prompt owns the keyboard
  if (ev.type === 'up') {
    if (code === 'Space' && s.play?.kind === 'preview' && s.play.hold) return { type: 'previewUp' }
    return null
  }
  // global
  if (code === 'Space' && !shift && !repeat && s.play) return { type: 'stop' }
  if (meta && code === 'KeyZ') return { type: shift ? 'redo' : 'undo' }
  if (meta && code === 'KeyE') return { type: 'exportBatch', to: shift ? 'folder' : 'zip' }
  const scrubKey =
    code === 'BracketLeft' ||
    code === 'BracketRight' ||
    (s.mode !== 'select' && (code === 'KeyH' || code === 'KeyL'))
  if (scrubKey) {
    if (meta) return null
    const dir = code === 'BracketLeft' || code === 'KeyH' ? -1 : 1
    return { type: 'scrub', dir, size: shift ? 'coarse' : alt ? 'fine' : 'plain' }
  }
  if (code === 'KeyJ' && !meta && !ctrl) return { type: 'zoom', kind: shift ? 'second' : 'in' }
  if (code === 'KeyK' && !meta && !ctrl) return { type: 'zoom', kind: shift ? 'fit' : 'out' }
  // Any other Cmd chord belongs to the browser (Cmd+R reload, Cmd+Shift+R hard reload, Cmd+C ...).
  // Ctrl chords likewise, except Ctrl+R redo below.
  if (meta) return null
  if (ctrl && code !== 'KeyR') return null

  if (s.mode === 'playhead') {
    if (code === 'Space') return repeat ? null : { type: 'playToggle' }
    if (code === 'KeyI' || code === 'KeyV') return { type: 'insert', first: shift ? 'end' : 'start' } // v/V as in vim's visual select
    if (code === 'KeyA') return { type: 'auditionPlayhead', side: shift ? 'end' : 'start' }
    if (code === 'Tab') return { type: 'tab' }
    if (code === 'KeyU') return { type: 'undo' }
    if (code === 'KeyR' && ctrl) return { type: 'redo' }
    return null
  }
  if (s.mode === 'insert') {
    if (code === 'KeyO') return { type: 'anchor' }
    if (code === 'KeyS' || code === 'Enter') return { type: 'save', exportAfter: shift } // S / Shift+Enter also export
    if (code === 'KeyA') return { type: 'audition' }
    if (code === 'Escape') return { type: 'cancel' }
    if (code === 'Space') return repeat ? null : { type: 'previewDown' }
    return null
  }
  // select
  if (code === 'KeyH') return { type: 'cycle', dir: -1 }
  if (code === 'KeyL') return { type: 'cycle', dir: 1 }
  if (code === 'KeyE') return shift ? { type: 'exportOne' } : { type: 'edit' }
  if (code === 'Space') return shift ? { type: 'toggleSelect' } : repeat ? null : { type: 'previewDown' }
  if (code === 'KeyA') return shift ? { type: 'clearSelect' } : { type: 'selectAll' }
  if (code === 'KeyC') return { type: 'clearSelect' }
  if (code === 'KeyP') return { type: 'toPlayhead', at: shift ? 'end' : 'start' }
  if (code === 'KeyX') return { type: 'delete' }
  if (code === 'KeyR') return ctrl ? { type: 'redo' } : { type: 'rename' }
  if (code === 'KeyU') return { type: 'undo' }
  if (code === 'Escape' || code === 'Tab') return { type: 'cancel' }
  return null
}

// ---------- reducer ----------

export function reduce(prev: State, a: Action): State {
  const s: State = { ...prev, lastChange: a.type }
  switch (a.type) {
    case 'setSetting':
      return { ...s, settings: { ...s.settings, [a.key]: a.value } }
    case 'setViewPx':
      return prev.viewPx === a.px ? prev : { ...s, viewPx: a.px }

    case 'scrub': {
      const d = a.dir * stepFrames(s, a.size)
      if (s.mode === 'insert' && s.draft) {
        return keepVisible({ ...s, draft: moveAnchor(s, s.draft, s.draft[s.draft.active] + d) })
      }
      const playhead = clamp(s.playhead + d, 0, s.frames)
      let n: State = { ...s, playhead }
      if (s.play?.kind === 'playhead') {
        n = { ...n, returnPoint: playhead, play: { kind: 'playhead', from: playhead }, playSeq: s.playSeq + 1 }
      }
      return keepVisible(n)
    }
    case 'seekTo': {
      if (s.mode === 'insert' && s.draft) {
        return { ...s, draft: moveAnchor(s, s.draft, Math.round(a.frame)) }
      }
      if (s.mode !== 'playhead') return prev
      const playhead = clamp(Math.round(a.frame), 0, s.frames)
      let n: State = { ...s, playhead }
      if (s.play?.kind === 'playhead') {
        n = { ...n, returnPoint: playhead, play: { kind: 'playhead', from: playhead }, playSeq: s.playSeq + 1 }
      }
      return keepVisible(n)
    }

    case 'zoom': {
      // j/k: 20% steps. J/K: 80% steps, J floored at a one-second window, K capped at the whole file.
      const win =
        a.kind === 'in'
          ? s.view.win / 1.2
          : a.kind === 'out'
            ? s.view.win * 1.2
            : a.kind === 'second'
              ? Math.max(s.sr, s.view.win * 0.2)
              : Math.min(s.frames, s.view.win * 5)
      return centerOn(s, win)
    }

    case 'playToggle': {
      if (s.play?.kind === 'playhead') {
        return { ...s, playhead: s.returnPoint ?? s.playhead, returnPoint: null, play: null, playSeq: s.playSeq + 1 }
      }
      return { ...s, returnPoint: s.playhead, play: { kind: 'playhead', from: s.playhead }, playSeq: s.playSeq + 1 }
    }
    case 'stop': {
      if (!s.play) return prev
      const playhead = s.play.kind === 'playhead' && s.returnPoint != null ? s.returnPoint : s.playhead
      return { ...s, playhead, returnPoint: null, play: null, playSeq: s.playSeq + 1 }
    }
    case 'playbackEnded': {
      if (!s.play) return prev
      if (s.play.kind === 'playhead') return { ...s, playhead: s.returnPoint ?? s.playhead, returnPoint: null, play: null }
      return { ...s, play: null }
    }

    case 'insert': {
      // i: start here, end a gap later, end active. I: end here, start a gap earlier, start active.
      const gap = Math.max(1, Math.round((s.view.win * s.settings.gapPct) / 100))
      const draft: Draft =
        a.first === 'start'
          ? { start: s.playhead, end: clamp(s.playhead + gap, s.playhead, s.frames), active: 'end', editingId: null }
          : { start: clamp(s.playhead - gap, 0, s.playhead), end: s.playhead, active: 'start', editingId: null }
      return keepVisible({ ...stopAll(s), mode: 'insert', draft })
    }
    case 'anchor': {
      if (!s.draft) return prev
      return keepVisible({ ...s, draft: { ...s.draft, active: s.draft.active === 'start' ? 'end' : 'start' } })
    }
    case 'save': {
      const dr = s.draft
      if (!dr) return prev
      if (dr.end <= dr.start) return toast({ ...s, shake: s.shake + 1 }, 'Region has no length.')
      const editing = dr.editingId != null ? find(s, dr.editingId) : null
      const idx = editing
        ? defaultIndex(
            { ...s, regions: s.regions.map((r) => (r.id === editing.id ? { ...r, start: dr.start, end: dr.end } : r)) },
            editing,
          )
        : ordered(s).filter((r) => r.start < dr.start || (r.start === dr.start && r.end <= dr.end)).length
      const def = `${s.basename}-${idx}`
      const value = editing && editing.name != null ? editing.name : def
      return { ...stopAll(s), prompt: { value, def, forDraft: true, regionId: null, exportAfter: a.exportAfter } }
    }
    case 'cancel': {
      if (s.mode === 'insert') return { ...stopAll(s), mode: 'playhead', draft: null }
      if (s.mode === 'select') return { ...stopAll(s), mode: 'playhead', activeId: null }
      return prev
    }
    case 'audition': {
      if (!s.draft) return prev
      return audition(s, s.draft[s.draft.active], s.draft.active)
    }
    case 'auditionPlayhead':
      return audition(s, s.playhead, a.side)
    case 'previewDown': {
      if (s.mode === 'insert') {
        const dr = s.draft
        if (!dr || dr.end <= dr.start) return prev
        return { ...s, play: { kind: 'preview', start: dr.start, end: dr.end, hold: true }, playSeq: s.playSeq + 1 }
      }
      const r = find(s, s.activeId)
      if (!r) return prev
      return { ...s, play: { kind: 'preview', start: r.start, end: r.end, hold: true }, playSeq: s.playSeq + 1 }
    }
    case 'previewUp': {
      if (s.play?.kind !== 'preview') return prev
      return { ...s, play: { ...s.play, hold: false }, playSeq: s.playSeq + 1 }
    }

    case 'promptInput':
      return s.prompt ? { ...s, prompt: { ...s.prompt, value: a.value, error: undefined } } : prev
    case 'promptCommit': {
      const p = s.prompt
      if (!p) return prev
      const typed = p.value.trim()
      const name = typed === '' || typed === p.def ? null : typed
      // A typed name must not collide with another region's filename: refuse, shake, and keep the prompt open.
      if (name != null) {
        const clash = nameClash(s, name, p.forDraft ? (s.draft?.editingId ?? null) : p.regionId)
        if (clash) {
          return toast({ ...s, shake: s.shake + 1, prompt: { ...p, error: `"${clash}" is already used by another region. Pick a different name.` } }, 'That name is already used by another region.')
        }
      }
      if (p.forDraft) {
        const dr = s.draft
        if (!dr) return prev
        let n = pushUndo(s)
        let savedId: number
        if (dr.editingId != null) {
          savedId = dr.editingId
          n = {
            ...n,
            regions: n.regions.map((r) => (r.id === dr.editingId ? { ...r, start: dr.start, end: dr.end, name } : r)),
          }
        } else {
          savedId = n.nextId
          n = { ...n, regions: [...n.regions, { id: n.nextId, start: dr.start, end: dr.end, name }], nextId: n.nextId + 1 }
        }
        n = keepVisible({ ...n, prompt: null, draft: null, mode: 'playhead', playhead: dr.end, activeId: null })
        if (p.exportAfter) {
          const saved = find(n, savedId)
          if (saved) n = { ...n, exportReq: { kind: 'one', files: filenames(n, [saved]) }, exportSeq: n.exportSeq + 1 }
        }
        return n
      }
      const n = pushUndo(s)
      return { ...n, regions: n.regions.map((r) => (r.id === p.regionId ? { ...r, name } : r)), prompt: null }
    }
    case 'promptCancel': {
      if (!s.prompt) return prev
      if (s.prompt.forDraft) return { ...s, prompt: null, draft: null, mode: 'playhead' }
      return { ...s, prompt: null }
    }

    case 'tab': {
      if (s.regions.length === 0) {
        return toast({ ...s, shake: s.shake + 1 }, 'No regions yet. Press i to add one.')
      }
      const ph = s.playhead
      const list = ordered(s)
      const inside = list.filter((r) => r.start <= ph && ph <= r.end)
      const pick = inside.length
        ? inside.reduce((a, b) => (a.end - a.start <= b.end - b.start ? a : b))
        : list.reduce((a, b) => (dist(a, ph) <= dist(b, ph) ? a : b))
      return keepVisible({ ...stopAll(s), mode: 'select', activeId: pick.id })
    }
    case 'cycle': {
      const list = ordered(s)
      if (!list.length) return prev
      const i = list.findIndex((r) => r.id === s.activeId)
      const j = (i + a.dir + list.length) % list.length
      return keepVisible({ ...stopAll(s), activeId: list[j]!.id }) // the playhead stays where it was
    }
    case 'pick': {
      // a click on a region in the list: Region Select mode, that region active, played once
      const r = find(s, a.id)
      if (!r || s.prompt) return prev
      return keepVisible({
        ...s, mode: 'select', draft: null, activeId: r.id,
        play: { kind: 'preview', start: r.start, end: r.end, hold: false }, playSeq: s.playSeq + 1, returnPoint: null,
      })
    }
    case 'edit': {
      const r = find(s, s.activeId)
      if (!r) return prev
      return keepVisible({ ...stopAll(s), mode: 'insert', draft: { start: r.start, end: r.end, active: 'end', editingId: r.id } })
    }
    case 'toggleSelect': {
      const id = s.activeId
      if (id == null) return prev
      const selected = s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]
      return { ...s, selected }
    }
    case 'selectAll':
      return { ...s, selected: s.regions.map((r) => r.id) }
    case 'clearSelect':
      return { ...s, selected: [] }
    case 'toPlayhead': {
      const r = find(s, s.activeId)
      if (!r) return prev
      return keepVisible({ ...stopAll(s), mode: 'playhead', playhead: a.at === 'start' ? r.start : r.end })
    }
    case 'delete': {
      const list = ordered(s)
      const i = list.findIndex((r) => r.id === s.activeId)
      if (i < 0) return prev
      let n = pushUndo(s)
      n = { ...n, regions: n.regions.filter((r) => r.id !== s.activeId), selected: n.selected.filter((x) => x !== s.activeId) }
      const rest = list.filter((r) => r.id !== s.activeId)
      if (!rest.length) return toast({ ...stopAll(n), mode: 'playhead', activeId: null }, 'No regions left.')
      const next = rest[Math.min(i, rest.length - 1)]!
      return { ...stopAll(n), activeId: next.id }
    }
    case 'rename': {
      const r = find(s, s.activeId)
      if (!r) return prev
      const def = `${s.basename}-${defaultIndex(s, r)}`
      return { ...stopAll(s), prompt: { value: r.name != null ? r.name : def, def, forDraft: false, regionId: r.id, exportAfter: false } }
    }
    case 'undo': {
      const regions = s.undo[s.undo.length - 1]
      if (!regions) return toast(s, 'Nothing to undo.')
      return fixActive({ ...s, regions, undo: s.undo.slice(0, -1), redo: [...s.redo, s.regions] })
    }
    case 'redo': {
      const regions = s.redo[s.redo.length - 1]
      if (!regions) return toast(s, 'Nothing to redo.')
      return fixActive({ ...s, regions, redo: s.redo.slice(0, -1), undo: [...s.undo, s.regions] })
    }

    case 'exportOne': {
      const r = find(s, s.activeId)
      if (!r) return prev
      return { ...stopAll(s), exportReq: { kind: 'one', files: filenames(s, [r]) }, exportSeq: s.exportSeq + 1 }
    }
    case 'exportBatch': {
      if (!s.regions.length) return toast(s, 'Nothing to export.')
      const set = s.selected.length ? s.regions.filter((r) => s.selected.includes(r.id)) : s.regions
      return {
        ...stopAll(s),
        selected: [],
        exportReq: { kind: a.to, files: filenames(s, set), zip: `${s.basename}-chops.zip` },
        exportSeq: s.exportSeq + 1,
      }
    }
    case 'notify':
      return toast(s, a.text)
    case 'restore': {
      // a persisted session: regions, selection, playhead, and view come back; undo history does not
      const clampF = (f: number) => clamp(Math.round(f), 0, s.frames)
      const regions = a.regions
        .map((r) => ({ ...r, start: clampF(r.start), end: clampF(r.end) }))
        .filter((r) => r.end > r.start)
      const ids = new Set(regions.map((r) => r.id))
      const win = clamp(Math.round(a.view.win), 64, s.frames)
      return {
        ...s,
        regions,
        nextId: Math.max(a.nextId, ...regions.map((r) => r.id + 1), 1),
        selected: a.selected.filter((id) => ids.has(id)),
        playhead: clampF(a.playhead),
        view: { win, start: clamp(Math.round(a.view.start), 0, Math.max(0, s.frames - win)) },
        undo: [],
        redo: [],
        mode: 'playhead',
        draft: null,
        activeId: null,
      }
    }
  }
}

/** The other region's display name whose export filename equals `name`'s, case-insensitively, or null. */
export function nameClash(s: State, name: string, exceptId: number | null): string | null {
  const mine = sanitize(name).toLowerCase()
  if (!mine) return null
  const all = ordered(s)
  for (let i = 0; i < all.length; i++) {
    const r = all[i]!
    if (r.id === exceptId) continue
    const theirs = (r.name != null ? sanitize(r.name) : `${s.basename}-${pad(i, all.length)}`).toLowerCase()
    if (theirs === mine) return displayName(s, r)
  }
  return null
}

/** Move the active anchor to `frame`, clamped to the file and never crossing the other anchor. */
function moveAnchor(s: State, dr: Draft, frame: number): Draft {
  const other = dr.active === 'start' ? dr.end : dr.start
  let v = clamp(frame, 0, s.frames)
  v = dr.active === 'start' ? Math.min(v, other) : Math.max(v, other)
  return { ...dr, [dr.active]: v }
}
