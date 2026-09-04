import { describe, it, expect } from 'vitest'
import {
  initial, keyToAction, reduce, filenames, sanitize, ordered, displayName, stepFrames,
  type State, type KeyEvent, type Action,
} from './chopper'

// ---------- a tiny keyboard driver, the shape of the prototype's smoke script ----------

const SR = 48000
const SECONDS = 30

type Mods = Partial<Pick<KeyEvent, 'shift' | 'alt' | 'meta' | 'ctrl' | 'repeat'>>

class Driver {
  s: State
  constructor(basename = 'rec') {
    this.s = initial(SECONDS * SR, basename, SR)
  }
  /** press a key (keydown) and apply its action, if any */
  key(code: string, mods: Mods = {}): Action | null {
    const a = keyToAction(this.s, { type: 'down', code, shift: false, alt: false, meta: false, ctrl: false, repeat: false, ...mods })
    if (a) this.s = reduce(this.s, a)
    return a
  }
  keyup(code: string): Action | null {
    const a = keyToAction(this.s, { type: 'up', code, shift: false, alt: false, meta: false, ctrl: false, repeat: false })
    if (a) this.s = reduce(this.s, a)
    return a
  }
  keys(...specs: string[]) {
    for (const spec of specs) {
      const parts = spec.split('+')
      const code = parts.pop()!
      this.key(code, {
        shift: parts.includes('Shift'), alt: parts.includes('Opt'), meta: parts.includes('Cmd'), ctrl: parts.includes('Ctrl'),
      })
    }
  }
  do(a: Action) {
    this.s = reduce(this.s, a)
  }
  /** type into the open prompt and press Enter */
  name(text: string | null) {
    expect(this.s.prompt).not.toBeNull()
    if (text != null) this.do({ type: 'promptInput', value: text })
    this.do({ type: 'promptCommit' })
  }
  sec(frames: number) {
    return frames / SR
  }
}

const files = (s: State) => filenames(s, s.regions).map((f) => f.file)

// ---------- walkthrough 1: mark and name a chop ----------

describe('mark and name a chop', () => {
  it('i places both anchors, end active; s prompts with the default; Enter saves and returns to Playhead mode at the end', () => {
    const d = new Driver()
    d.keys('Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL') // 10% of the window each, fitted: 3 s each
    expect(d.sec(d.s.playhead)).toBe(12)
    d.keys('KeyI')
    expect(d.s.mode).toBe('insert')
    expect(d.s.draft).toEqual({ start: 12 * SR, end: 18 * SR, active: 'end', editingId: null }) // 20% of 30 s = 6 s
    d.keys('KeyO', 'KeyO')
    expect(d.s.draft!.active).toBe('end')
    d.keys('Shift+KeyH', 'Shift+KeyH', 'Shift+KeyH') // fine = one pixel of a 1000 px view = 1440 frames
    expect(d.s.draft!.end).toBe(18 * SR - 3 * 1440)
    d.keys('KeyA')
    expect(d.s.play).toEqual({ kind: 'audition', side: 'end', end: d.s.draft!.end, start: d.s.draft!.end - 0.3 * SR })
    d.keys('Shift+KeyJ')
    expect(d.s.view.win).toBe(6 * SR) // 80% in: 30 s becomes 6 s
    d.keys('KeyS')
    expect(d.s.prompt).toMatchObject({ value: 'rec-0', def: 'rec-0', forDraft: true, exportAfter: false })
    expect(d.s.play).toBeNull() // opening the prompt stops the audition
    d.name(null)
    expect(d.s.mode).toBe('playhead')
    expect(d.s.regions).toHaveLength(1)
    expect(d.s.regions[0]!.name).toBeNull() // accepting the default keeps it automatic
    expect(d.s.playhead).toBe(d.s.regions[0]!.end)
    expect(files(d.s)).toEqual(['rec-00.wav'])
  })

  it('v and V are aliases for i and I', () => {
    const d = new Driver()
    d.keys('Opt+KeyL', 'KeyV')
    expect(d.s.mode).toBe('insert')
    expect(d.s.draft).toMatchObject({ start: 3 * SR, active: 'end' })
    d.keys('Escape', 'Shift+KeyV')
    expect(d.s.draft).toMatchObject({ end: 3 * SR, active: 'start' })
  })

  it('Enter in Insert Region mode is the same as s', () => {
    const d = new Driver()
    d.keys('KeyI', 'Enter')
    expect(d.s.prompt).toMatchObject({ forDraft: true, exportAfter: false })
    d.name('hat')
    expect(d.s.regions).toHaveLength(1)
    d.keys('KeyI', 'Shift+Enter')
    expect(d.s.prompt).toMatchObject({ forDraft: true, exportAfter: true })
  })

  it('I mirrors i: end at the playhead, start a gap earlier, start active', () => {
    const d = new Driver()
    d.keys('Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL')
    d.keys('Shift+KeyI')
    expect(d.s.draft).toEqual({ start: 3 * SR, end: 9 * SR, active: 'start', editingId: null })
  })

  it('anchors cannot cross, by key or by drag', () => {
    const d = new Driver()
    d.keys('KeyI')
    d.keys('KeyO') // start active
    for (let i = 0; i < 10; i++) d.keys('Opt+KeyL')
    expect(d.s.draft!.start).toBe(d.s.draft!.end)
    d.do({ type: 'seekTo', frame: 25 * SR })
    expect(d.s.draft!.start).toBe(d.s.draft!.end)
    d.keys('KeyS')
    expect(d.s.prompt).toBeNull()
    expect(d.s.toast!.text).toBe('Region has no length.')
    expect(d.s.shake).toBe(1)
  })

  it('a typed name replaces the default and Esc in the prompt discards the draft', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    d.name('kick')
    expect(d.s.regions[0]!.name).toBe('kick')
    d.keys('KeyI', 'KeyS')
    d.do({ type: 'promptCancel' })
    expect(d.s.mode).toBe('playhead')
    expect(d.s.draft).toBeNull()
    expect(d.s.regions).toHaveLength(1)
  })

  it('Esc in Insert mode discards and leaves the playhead where it was', () => {
    const d = new Driver()
    d.keys('KeyL', 'KeyL')
    const ph = d.s.playhead
    d.keys('KeyI', 'KeyL', 'KeyL', 'Escape')
    expect(d.s.mode).toBe('playhead')
    expect(d.s.playhead).toBe(ph)
  })
})

// ---------- walkthrough 2: export one chop, and S ----------

describe('export one', () => {
  it('E in Region Select requests a single export of the active region', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    d.name('snare')
    d.keys('Tab', 'Shift+KeyE')
    expect(d.s.exportReq).toMatchObject({ kind: 'one', files: [{ file: 'snare.wav' }] })
    expect(d.s.exportSeq).toBe(1)
  })

  it('S in Insert mode names, saves, exports, and returns to Playhead mode', () => {
    const d = new Driver()
    d.keys('KeyI', 'Shift+KeyS')
    expect(d.s.prompt!.exportAfter).toBe(true)
    d.name('hat')
    expect(d.s.mode).toBe('playhead')
    expect(d.s.regions).toHaveLength(1)
    expect(d.s.exportReq).toMatchObject({ kind: 'one', files: [{ file: 'hat.wav' }] })
  })
})

// ---------- walkthrough 3: tap versus hold ----------

describe('preview intents', () => {
  it('Space down holds a looping preview; Space up releases it; Space again stops', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    d.name(null)
    d.keys('Tab')
    const r = d.s.regions[0]!
    d.keys('Space')
    expect(d.s.play).toEqual({ kind: 'preview', start: r.start, end: r.end, hold: true })
    expect(d.key('Space', { repeat: true })).toBeNull() // auto-repeat is ignored
    d.keyup('Space')
    expect(d.s.play).toMatchObject({ kind: 'preview', hold: false })
    d.keys('Space')
    expect(d.s.play).toBeNull()
  })

  it('p and P leave Region Select with the playhead at the start or end', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    d.name(null)
    const r = d.s.regions[0]!
    d.keys('Tab', 'KeyP')
    expect(d.s.mode).toBe('playhead')
    expect(d.s.playhead).toBe(r.start)
    d.keys('Tab', 'Shift+KeyP')
    expect(d.s.playhead).toBe(r.end)
  })

  it('Space in Playhead mode plays and snaps back to the Return point; scrubbing while playing restarts', () => {
    const d = new Driver()
    d.keys('KeyL', 'KeyL')
    const ph = d.s.playhead
    d.keys('Space')
    expect(d.s.play).toEqual({ kind: 'playhead', from: ph })
    expect(d.s.returnPoint).toBe(ph)
    d.keys('KeyL')
    expect(d.s.play).toEqual({ kind: 'playhead', from: d.s.playhead })
    expect(d.s.returnPoint).toBe(d.s.playhead)
    const moved = d.s.playhead
    d.keys('Space')
    expect(d.s.play).toBeNull()
    expect(d.s.playhead).toBe(moved)
  })

  it('a and A audition ahead of and behind the playhead', () => {
    const d = new Driver()
    d.keys('Opt+KeyL')
    d.keys('KeyA')
    expect(d.s.play).toEqual({ kind: 'audition', start: 3 * SR, end: 3.3 * SR, side: 'start' })
    d.keys('Space') // stop
    d.keys('Shift+KeyA')
    expect(d.s.play).toEqual({ kind: 'audition', start: 3 * SR - 0.3 * SR, end: 3 * SR, side: 'end' })
  })
})

// ---------- walkthrough 4: overlap, cycle, select, batch export ----------

describe('overlap, cycle, select, batch export', () => {
  function twoOverlapping() {
    const d = new Driver()
    d.keys('Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL', 'KeyI', 'KeyS') // 12 s to 18 s
    d.name(null)
    d.keys('Shift+KeyI', 'Opt+KeyH', 'Opt+KeyH', 'KeyS') // ends at 18 s, starts well before 12 s
    d.name('808/kick')
    return d
  }

  it('regions overlap and h/l cycle in start-time order without moving the playhead', () => {
    const d = twoOverlapping()
    const [first, second] = ordered(d.s)
    expect(first!.start).toBeLessThan(second!.start)
    expect(first!.end).toBe(second!.end)
    const ph = d.s.playhead
    d.keys('Tab')
    expect(d.s.mode).toBe('select')
    expect(d.s.activeId).toBe(second!.id) // both contain the playhead; the shorter one wins
    d.keys('KeyL')
    expect(d.s.activeId).toBe(first!.id) // wraps
    d.keys('KeyH')
    expect(d.s.activeId).toBe(second!.id)
    expect(d.s.playhead).toBe(ph)
    d.keys('Tab')
    expect(d.s.mode).toBe('playhead')
    expect(d.s.playhead).toBe(ph)
  })

  it('Shift+Space toggles selection; Cmd+E zips the selection and clears it; Cmd+E with nothing selected zips all', () => {
    const d = twoOverlapping()
    d.keys('Tab', 'Shift+Space')
    expect(d.s.selected).toEqual([d.s.activeId])
    d.keys('Escape', 'Tab') // selection survives mode switches
    expect(d.s.selected).toHaveLength(1)
    d.keys('Cmd+KeyE')
    expect(d.s.exportReq).toMatchObject({ kind: 'zip', zip: 'rec-chops.zip' })
    expect(d.s.exportReq!.files).toHaveLength(1)
    expect(d.s.selected).toEqual([])
    d.keys('Cmd+KeyE')
    expect(d.s.exportReq!.files.map((f) => f.file)).toEqual(['808_kick.wav', 'rec-01.wav'])
    d.keys('Cmd+Shift+KeyE')
    expect(d.s.exportReq).toMatchObject({ kind: 'folder' })
    expect(d.s.exportReq!.files).toHaveLength(2)
  })

  it('a selects all; c (and Shift+A) clear', () => {
    const d = twoOverlapping()
    d.keys('Tab', 'KeyA')
    expect(d.s.selected).toHaveLength(2)
    d.keys('KeyC')
    expect(d.s.selected).toEqual([])
    d.keys('KeyA', 'Shift+KeyA')
    expect(d.s.selected).toEqual([])
  })

  it('automatic names renumber when a region is inserted earlier in the file', () => {
    const d = new Driver()
    d.keys('Opt+KeyL', 'Opt+KeyL', 'KeyI', 'KeyS')
    d.name(null)
    expect(files(d.s)).toEqual(['rec-00.wav'])
    d.do({ type: 'seekTo', frame: 0 })
    d.keys('KeyI', 'KeyS')
    d.name(null)
    expect(files(d.s)).toEqual(['rec-00.wav', 'rec-01.wav'])
    const later = ordered(d.s)[1]!
    expect(displayName(d.s, later)).toBe('rec-1')
  })
})

// ---------- walkthrough 5: edit, rename, delete, undo ----------

describe('edit, rename, delete, undo', () => {
  it('e reopens bounds with the end anchor active and saving is one undo step', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    d.name('loop')
    const before = d.s.regions[0]!
    d.keys('Tab', 'KeyE')
    expect(d.s.mode).toBe('insert')
    expect(d.s.draft).toEqual({ start: before.start, end: before.end, active: 'end', editingId: before.id })
    d.keys('KeyL', 'KeyS')
    expect(d.s.prompt!.value).toBe('loop')
    d.name(null)
    expect(d.s.regions[0]!.end).toBeGreaterThan(before.end)
    expect(d.s.regions[0]!.name).toBe('loop')
    d.keys('KeyU')
    expect(d.s.regions[0]!.end).toBe(before.end)
  })

  it('r renames only; x deletes and activates the next; deleting the last returns to Playhead mode', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name(null)
    d.keys('KeyI', 'KeyS'); d.name(null)
    d.keys('Tab', 'KeyR')
    d.name('CON')
    expect(files(d.s)).toContain('CON_.wav')
    d.keys('KeyX')
    expect(d.s.regions).toHaveLength(1)
    expect(d.s.mode).toBe('select')
    expect(d.s.activeId).toBe(d.s.regions[0]!.id)
    d.keys('KeyX')
    expect(d.s.regions).toHaveLength(0)
    expect(d.s.mode).toBe('playhead')
    expect(d.s.toast!.text).toBe('No regions left.')
  })

  it('undo and redo work across mode changes and via Ctrl+R and Cmd+Z', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name(null)
    d.keys('KeyI', 'KeyS'); d.name(null)
    d.keys('Tab', 'KeyX', 'KeyX')
    expect(d.s.regions).toHaveLength(0)
    d.keys('KeyU')
    expect(d.s.regions).toHaveLength(1)
    d.keys('Cmd+KeyZ')
    expect(d.s.regions).toHaveLength(2)
    d.keys('Ctrl+KeyR')
    expect(d.s.regions).toHaveLength(1)
    d.keys('Cmd+Shift+KeyZ')
    expect(d.s.regions).toHaveLength(0)
    d.keys('KeyU', 'KeyU') // undo both deletes
    expect(d.s.regions).toHaveLength(2)
    d.keys('KeyU', 'KeyU') // undo both creates
    expect(d.s.regions).toHaveLength(0)
    d.keys('KeyU')
    expect(d.s.toast!.text).toBe('Nothing to undo.')
  })
})

// ---------- walkthrough 6: Tab with no regions ----------

describe('Tab with no regions', () => {
  it('shakes, toasts, and stays in Playhead mode', () => {
    const d = new Driver()
    d.keys('Tab')
    expect(d.s.mode).toBe('playhead')
    expect(d.s.shake).toBe(1)
    expect(d.s.toast!.text).toBe('No regions yet. Press i to add one.')
  })
})

// ---------- zoom and steps ----------

describe('zoom and the step ladder', () => {
  it('steps are relative to the visible window', () => {
    const d = new Driver()
    expect(stepFrames(d.s, 'plain')).toBe(0.3 * SR)
    expect(stepFrames(d.s, 'coarse')).toBe(3 * SR)
    expect(stepFrames(d.s, 'fine')).toBe(1440)
    d.keys('Shift+KeyJ')
    expect(stepFrames(d.s, 'plain')).toBe(0.06 * SR)
  })

  it('J floors at one second, K caps at the whole file, j/k are 20% steps', () => {
    const d = new Driver()
    d.keys('Shift+KeyJ', 'Shift+KeyJ', 'Shift+KeyJ')
    expect(d.s.view.win).toBe(SR)
    d.keys('KeyJ')
    expect(d.s.view.win).toBe(Math.round(SR / 1.2))
    d.keys('Shift+KeyK', 'Shift+KeyK', 'Shift+KeyK')
    expect(d.s.view.win).toBe(SECONDS * SR)
    d.keys('KeyK')
    expect(d.s.view.win).toBe(SECONDS * SR) // cannot zoom out past the file
  })
})

// ---------- the prompt owns the keyboard ----------

describe('prompt', () => {
  it('no hotkey fires while the prompt is open', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS')
    expect(d.key('KeyL')).toBeNull()
    expect(d.key('Space')).toBeNull()
    expect(d.key('Escape')).toBeNull()
  })
})

// ---------- filename rules ----------

describe('sanitize', () => {
  it.each([
    [' ..808/kick.WAV ', '808_kick'],
    ['   ', ''],
    ['a:b*c?d"e<f>g|h', 'a_b_c_d_e_f_g_h'],
    ['con', 'con_'],
    ['LPT9', 'LPT9_'],
    ['café', 'café'.normalize('NFC')],
    ['tab\there', 'tab_here'],
    ['x'.repeat(200), 'x'.repeat(120)],
    ['trailing.', 'trailing'],
  ])('%j becomes %j', (input, expected) => {
    expect(sanitize(input)).toBe(expected)
  })
})

describe('filenames', () => {
  it('the prompt refuses a typed name that collides with another region, case-insensitively, and shakes', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name('Kick')
    d.keys('KeyI', 'KeyS')
    d.do({ type: 'promptInput', value: 'kick' })
    d.do({ type: 'promptCommit' })
    expect(d.s.prompt).not.toBeNull() // still open
    expect(d.s.prompt!.error).toContain('Kick')
    expect(d.s.shake).toBe(1)
    expect(d.s.regions).toHaveLength(1)
    d.do({ type: 'promptInput', value: 'kick 2' })
    expect(d.s.prompt!.error).toBeUndefined()
    d.do({ type: 'promptCommit' })
    expect(d.s.regions).toHaveLength(2)
    // sanitised forms are compared: "808/kick" and "808_kick" are the same file
    d.keys('Tab', 'KeyR'); d.name('808_kick')
    d.keys('KeyL', 'KeyR')
    d.do({ type: 'promptInput', value: '808/kick' })
    d.do({ type: 'promptCommit' })
    expect(d.s.prompt!.error).toBeDefined()
    d.do({ type: 'promptCancel' })
    // renaming a region to its own current name is not a clash
    d.keys('KeyH', 'KeyR')
    d.do({ type: 'promptCommit' })
    expect(d.s.prompt).toBeNull()
  })

  it('the export safety net still suffixes a typed name that equals an automatic one', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name('rec-01') // equals what the next region will be called automatically
    d.keys('KeyI', 'KeyS'); d.name(null)
    const out = filenames(d.s, d.s.regions)
    expect(out.map((f) => f.file)).toEqual(['rec-01.wav', 'rec-01 (2).wav'])
    expect(out.map((f) => f.collided)).toEqual([false, true])
  })

  it('pads automatic indices to the count width', () => {
    const d = new Driver()
    d.keys('Shift+KeyJ', 'Shift+KeyJ', 'Shift+KeyJ') // one-second window, so eleven 0.2 s regions fit
    for (let i = 0; i < 11; i++) {
      d.keys('KeyI', 'KeyS')
      d.name(null)
    }
    expect(files(d.s)[0]).toBe('rec-00.wav')
    expect(files(d.s)[10]).toBe('rec-10.wav')
  })
})

// ---------- pick from the list ----------

describe('pick', () => {
  it('a click on a listed region enters Region Select on it and plays it once', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name('a')
    d.keys('KeyI', 'KeyS'); d.name('b')
    const second = ordered(d.s)[1]!
    d.do({ type: 'pick', id: second.id })
    expect(d.s.mode).toBe('select')
    expect(d.s.activeId).toBe(second.id)
    expect(d.s.play).toEqual({ kind: 'preview', start: second.start, end: second.end, hold: false })
    d.do({ type: 'pick', id: 999 })
    expect(d.s.activeId).toBe(second.id)
  })
})

// ---------- restore ----------

describe('restore', () => {
  it('brings back regions, selection, playhead, and view, clamped to the file, with no undo history', () => {
    const d = new Driver()
    d.do({
      type: 'restore',
      regions: [
        { id: 3, start: 10, end: 20, name: 'kick' },
        { id: 5, start: 100, end: 99_999_999, name: null }, // end past the file: clamped
        { id: 7, start: 50, end: 50, name: 'empty' }, // zero length: dropped
      ],
      nextId: 2, // stale: bumped past the highest id
      selected: [3, 7, 42],
      playhead: 15,
      view: { win: 4800, start: 0 },
    })
    expect(d.s.regions.map((r) => r.id)).toEqual([3, 5])
    expect(d.s.regions[1]!.end).toBe(SECONDS * SR)
    expect(d.s.nextId).toBe(6)
    expect(d.s.selected).toEqual([3])
    expect(d.s.playhead).toBe(15)
    expect(d.s.view).toEqual({ win: 4800, start: 0 })
    expect(d.s.undo).toEqual([])
    expect(d.s.mode).toBe('playhead')
    d.keys('KeyI', 'KeyS'); d.name(null)
    expect(d.s.regions[2]!.id).toBe(6)
  })
})

// ---------- browser chords pass through ----------

describe('browser chords', () => {
  it('Cmd+R and Cmd+Shift+R are never claimed, in any mode', () => {
    const d = new Driver()
    d.keys('KeyI', 'KeyS'); d.name(null)
    expect(d.key('KeyR', { meta: true })).toBeNull()
    expect(d.key('KeyR', { meta: true, shift: true })).toBeNull()
    d.keys('Tab')
    expect(d.s.mode).toBe('select')
    expect(d.key('KeyR', { meta: true })).toBeNull()
    expect(d.key('KeyR', { meta: true, shift: true })).toBeNull()
    expect(d.key('KeyC', { meta: true })).toBeNull()
    expect(d.s.prompt).toBeNull()
    expect(d.key('KeyR', { ctrl: true })).toEqual({ type: 'redo' })
  })
})
