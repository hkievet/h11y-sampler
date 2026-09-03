/**
 * The tutorial's content: six walkthroughs and the keymap reference.
 * Key specs are `Mod+Mod+Code` with mods Shift, Opt, Cmd, Ctrl and a `:hold`
 * suffix for a held Space; they replay through the real key listener.
 */

export interface Step {
  text: string
  keys: string[]
}
export interface Walkthrough {
  title: string
  intro: string
  steps: Step[]
}

const L = 'KeyL'

export const walkthroughs: Walkthrough[] = [
  {
    title: '1 Mark and name a chop',
    intro: 'The core loop, on the demo recording. Watch the two anchors: i places both and hands you the end.',
    steps: [
      { text: 'Press Opt+l four times (10% of the window each): past 10 s, into the drums', keys: ['Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL', 'Opt+KeyL'] },
      { text: 'Press i: Insert Region mode, start anchor at the playhead, end anchor 20% of the screen later and active', keys: ['KeyI'] },
      { text: 'Press o twice: the active anchor toggles to start and back to end', keys: ['KeyO', 'KeyO'] },
      { text: 'Press H three times: nudge the end earlier by one pixel each', keys: ['Shift+KeyH', 'Shift+KeyH', 'Shift+KeyH'] },
      { text: 'Press a: hear the last 300 ms leading into the end anchor', keys: ['KeyA'] },
      { text: 'Press J: zoom in 80% around the active anchor', keys: ['Shift+KeyJ'] },
      { text: 'Press s: the save prompt opens with the default name highlighted. Type a name or just press Enter', keys: ['KeyS'] },
    ],
  },
  {
    title: '2 Export one chop',
    intro: 'Export the active region as a single WAV to Downloads.',
    steps: [
      { text: 'Press K until fully zoomed out, then Opt+l once: near 3 s', keys: ['Shift+KeyK', 'Shift+KeyK', 'Shift+KeyK', 'Opt+KeyL'] },
      { text: 'Press i, then s: a draft with the prompt open. Press Enter yourself', keys: ['KeyI', 'KeyS'] },
      { text: 'Press Tab: select it', keys: ['Tab'] },
      { text: 'Press E (Shift+e): the chop downloads', keys: ['Shift+KeyE'] },
    ],
  },
  {
    title: '3 Loop a hit',
    intro: 'In Region Select mode, a tap of Space plays the active region once; holding loops it and releasing stops.',
    steps: [
      { text: 'Press Tab (needs a region; do walkthrough 1 first)', keys: ['Tab'] },
      { text: 'Tap Space: one pass, then it stops', keys: ['Space'] },
      { text: 'Hold Space (the button holds 900 ms): it loops, then stops on release', keys: ['Space:hold'] },
      { text: 'Press p: back to Playhead mode at the region start. P would go to its end', keys: ['KeyP'] },
    ],
  },
  {
    title: '4 Overlap and batch export',
    intro: 'Regions may overlap. h/l cycle in start-time order. Shift+Space marks regions for the zip.',
    steps: [
      { text: 'Press I (Shift+i): end anchor at the playhead, start anchor 20% of the screen earlier and active', keys: ['Shift+KeyI'] },
      { text: 'Press Opt+h: the coarse step pulls the start well before the other region', keys: ['Opt+KeyH'] },
      { text: 'Press s, then Enter: an overlapping region', keys: ['KeyS'] },
      { text: 'Press Tab, then l, then h: cycle by start time, wrapping; the playhead stays put', keys: ['Tab', L, 'KeyH'] },
      { text: 'Press Shift+Space, then Cmd+E: only the selected one is zipped, the set clears', keys: ['Shift+Space', 'Cmd+KeyE'] },
      { text: 'Press Cmd+E again with nothing selected: everything is zipped', keys: ['Cmd+KeyE'] },
    ],
  },
  {
    title: '5 Edit, rename, delete, undo',
    intro: 'e reopens a region in Insert mode with its bounds; r renames only; x deletes; u undoes.',
    steps: [
      { text: 'Press Tab, then e: draft has the region bounds, end anchor active', keys: ['Tab', 'KeyE'] },
      { text: 'Press l, then s, then Enter: the bounds change is one undo step', keys: [L, 'KeyS'] },
      { text: 'Press Tab, then r: rename prompt with the existing name highlighted. Type 808/kick and watch the preview', keys: ['Tab', 'KeyR'] },
      { text: 'Press x: region deleted, the next becomes active', keys: ['KeyX'] },
      { text: 'Press u: it is back. Ctrl+R redoes', keys: ['KeyU'] },
    ],
  },
  {
    title: '6 Tab with no regions',
    intro: 'Delete everything, then Tab: the waveform shakes and a toast says what to do.',
    steps: [
      { text: 'Press Tab, then x until none are left', keys: ['Tab', 'KeyX', 'KeyX', 'KeyX', 'KeyX', 'KeyX'] },
      { text: 'Press Tab in Playhead mode', keys: ['Tab'] },
    ],
  },
]

export const keymap: Record<string, [string, string][]> = {
  'Any mode': [
    ['Space (while playing)', 'stop whatever is playing'],
    ['Cmd+E', 'export a zip of the selected regions, or all'],
    ['Cmd+Shift+E', 'write the same chops into a folder'],
    ['u / Ctrl+R', 'undo / redo (Cmd+Z / Cmd+Shift+Z too)'],
    ['?', 'toggle this tutorial'],
  ],
  'Playhead mode': [
    ['h / l', 'scrub by 1% of the visible window ([ ] too)'],
    ['H / L', 'scrub by one pixel at the current zoom'],
    ['Opt+h / Opt+l', 'scrub by 10% of the visible window'],
    ['j / k', 'zoom in / out 20% around the playhead'],
    ['J / K', 'zoom in / out 80%; J stops at a one-second window, K at the whole file'],
    ['Space', 'play from the playhead; again stops and snaps back'],
    ['scrub while playing', 'restarts at the new spot'],
    ['a / A', 'audition 300 ms ahead of / behind the playhead'],
    ['i', 'Insert Region: start here, end 20% of the window later, end active'],
    ['I', 'Insert Region: end here, start 20% earlier, start active'],
    ['Tab', 'Region Select (shakes if there are none)'],
    ['mouse drag', 'move the playhead'],
  ],
  'Insert Region mode': [
    ['h l H L Opt+h Opt+l', 'move the active anchor; anchors cannot cross'],
    ['mouse drag', 'move the active anchor'],
    ['j k J K', 'zoom around the active anchor'],
    ['o', 'toggle which anchor is active'],
    ['a', 'audition the active anchor: start plays forward, end plays into it'],
    ['Space', 'preview the draft: tap once, hold loops'],
    ['s', 'name prompt; Enter saves, back to Playhead mode at the region end'],
    ['S', 'name prompt; Enter saves, exports to Downloads, back to Playhead mode'],
    ['Esc', 'discard the draft, from the prompt too'],
  ],
  'Region Select mode': [
    ['h / l', 'previous / next region by start time; the playhead stays'],
    ['e', 'edit bounds in Insert Region mode'],
    ['E', 'export this region to Downloads'],
    ['Space', 'tap: play once; hold: loop'],
    ['Shift+Space', 'toggle in the selection'],
    ['a / c', 'select all / clear the selection'],
    ['p / P', 'Playhead mode at the region start / end'],
    ['x', 'delete'],
    ['r', 'rename'],
    ['Esc / Tab', 'back to Playhead mode'],
  ],
}

/** Replay a key spec through the window's real listeners. */
export function replay(spec: string): Promise<void> {
  const hold = spec.endsWith(':hold')
  const parts = spec.replace(':hold', '').split('+')
  const code = parts.pop()!
  const init: KeyboardEventInit = {
    code,
    key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code,
    shiftKey: parts.includes('Shift'),
    altKey: parts.includes('Opt'),
    metaKey: parts.includes('Cmd'),
    ctrlKey: parts.includes('Ctrl'),
    bubbles: true,
    cancelable: true,
  }
  window.dispatchEvent(new KeyboardEvent('keydown', init))
  return new Promise((resolve) => {
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', init))
      resolve()
    }, hold ? 900 : 60)
  })
}

/** Replay a whole step, one key after another. */
export async function replayStep(keys: string[]): Promise<void> {
  for (const k of keys) {
    await replay(k)
    await new Promise((r) => setTimeout(r, 80))
  }
}
