import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region as WsRegion } from 'wavesurfer.js/plugins/regions'
import { ordered, displayName, type State, type Action } from '../core/chopper'
import type { Source } from '../source'

/**
 * The waveform view. wavesurfer renders the base waveform from the Source's
 * 64-frame peaks level and the Regions plugin draws saved Regions; a canvas
 * overlay owns everything the keyboard model needs: the draft and its
 * Anchors, the Active Region highlight, labels, selection marks, the
 * Playhead (Playhead mode only), the coloured play cursor, the ruler, mouse
 * drag, and a sample-exact detail draw when the zoom is finer than the level.
 *
 * The Core's `view` (window and start, in frames) is the only truth for zoom
 * and scroll; wavesurfer is driven to match and never scrolls on its own.
 */

export type PlayCursor = { frame: number; kind: 'playhead' | 'audition' | 'preview' | 'export' } | null

const LEVEL = 64 // frames per bucket in the Source's peaks level
const COLOURS = {
  wave: '#9aa3b5', region: 'rgba(255,180,84,.14)', regionLine: 'rgba(255,180,84,.6)', regionText: '#ffb454',
  active: 'rgba(90,209,255,.28)', activeLine: '#5ad1ff', draft: 'rgba(123,216,143,.18)', anchor: '#7bd88f',
  anchorDim: 'rgba(123,216,143,.6)', playhead: '#ff5a5a', axis: '#2a2f3a', ruler: '#8a8f9c',
  cursor: { playhead: '#ffffff', audition: '#7bd88f', preview: '#5ad1ff', export: '#ffb454' },
}

export function Waveform({ source, s, dispatch, playCursor }: {
  source: Source
  s: State
  dispatch: (a: Action) => void
  playCursor: () => PlayCursor
}) {
  const box = useRef<HTMLDivElement>(null)
  const wsBox = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ws = useRef<WaveSurfer | null>(null)
  const plugin = useRef<RegionsPlugin | null>(null)
  const wsRegions = useRef(new Map<number, WsRegion>())
  const ready = useRef(false)
  const [width, setWidth] = useState(1000)
  const sRef = useRef(s)
  sRef.current = s
  const detail = useRef<{ key: string; chans: Int16Array[] | null }>({ key: '', chans: null })
  const cursorRef = useRef(playCursor)
  cursorRef.current = playCursor

  // ---- wavesurfer, once per Source ----
  useEffect(() => {
    const rp = RegionsPlugin.create()
    const w = WaveSurfer.create({
      container: wsBox.current!,
      height: 'auto',
      waveColor: COLOURS.wave,
      progressColor: COLOURS.wave,
      cursorWidth: 0,
      interact: false,
      hideScrollbar: true,
      autoScroll: false,
      autoCenter: false,
      fillParent: true,
      minPxPerSec: 0,
      normalize: false,
      plugins: [rp],
    })
    ws.current = w
    plugin.current = rp
    wsRegions.current = new Map()
    let cancelled = false
    ;(async () => {
      const buckets = Math.min(Math.ceil(source.info.frames / LEVEL), 4_000_000)
      const peaks = await source.peaks(buckets)
      if (cancelled) return
      // No media for wavesurfer: with a source set, getDuration() prefers the audio element's
      // metadata, which can differ from frames / sampleRate and arrives late, shifting every
      // region and scroll position. Peaks plus the exact duration is all it needs to draw.
      await w.load('', peaks, source.info.duration)
      if (cancelled) return
      ready.current = true
      syncView()
      syncRegions()
      // wavesurfer re-renders on its own when the container resizes (layout settling after a
      // reload, the tutorial panel toggling) and resets its scroll; put it back every time.
      w.on('redrawcomplete', () => syncScroll())
    })()
    return () => {
      cancelled = true
      ready.current = false
      w.destroy()
      ws.current = null
      plugin.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // ---- size ----
  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => {
      const px = Math.max(1, Math.round(el.clientWidth))
      setWidth(px)
      dispatch({ type: 'setViewPx', px })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [dispatch])

  // ---- drive wavesurfer's zoom and scroll from the Core's view ----
  function syncView() {
    const w = ws.current
    if (!w || !ready.current) return
    const { view, sr } = sRef.current
    const spp = view.win / width
    if (spp >= LEVEL) {
      wsBox.current!.style.opacity = '1'
      const pxPerSec = width / (view.win / sr)
      w.zoom(pxPerSec)
      w.setScrollTime(view.start / sr)
    } else {
      // finer than the level: the overlay draws raw samples, wavesurfer would only stretch
      wsBox.current!.style.opacity = '0'
    }
  }
  function syncScroll() {
    const w = ws.current
    if (!w || !ready.current) return
    const { view, sr } = sRef.current
    if (view.win / width >= LEVEL) w.setScrollTime(view.start / sr)
  }
  useEffect(syncView, [s.view.win, s.view.start, width]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mirror saved Regions into the plugin ----
  function syncRegions() {
    const rp = plugin.current
    if (!rp || !ready.current) return
    const { regions, sr } = sRef.current
    const seen = new Set<number>()
    for (const r of regions) {
      seen.add(r.id)
      const existing = wsRegions.current.get(r.id)
      const start = r.start / sr
      const end = r.end / sr
      if (existing) {
        if (existing.start !== start || existing.end !== end) existing.setOptions({ start, end })
      } else {
        const added = rp.addRegion({ id: `r${r.id}`, start, end, color: COLOURS.region, drag: false, resize: false })
        if (added.element) added.element.style.pointerEvents = 'none'
        wsRegions.current.set(r.id, added)
      }
    }
    for (const [id, reg] of wsRegions.current) {
      if (!seen.has(id)) {
        reg.remove()
        wsRegions.current.delete(id)
      }
    }
  }
  useEffect(syncRegions, [s.regions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mouse: drag moves the Playhead or the active Anchor, by mode ----
  const dragging = useRef(false)
  const frameOf = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect()
    const { view } = sRef.current
    return view.start + ((clientX - rect.left) / rect.width) * view.win
  }

  // ---- overlay ----
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      if (!c) return
      const st = sRef.current
      const W = c.clientWidth
      const H = c.clientHeight
      const dpr = devicePixelRatio || 1
      if (c.width !== W * dpr || c.height !== H * dpr) {
        c.width = W * dpr
        c.height = H * dpr
      }
      const cx = c.getContext('2d')!
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx.clearRect(0, 0, W, H)
      const { view, sr } = st
      const xOf = (f: number) => ((f - view.start) / view.win) * W
      const spp = view.win / W
      const mid = H * 0.5
      const amp = H * 0.45

      // sample-exact detail when finer than the level
      if (spp < LEVEL) {
        const key = `${view.start}:${view.win}`
        if (detail.current.key !== key) {
          detail.current = { key, chans: null }
          void source.window({ start: Math.floor(view.start), end: Math.ceil(view.start + view.win) + 1 }).then((chans) => {
            if (detail.current.key === key) detail.current.chans = chans
          })
        }
        const chans = detail.current.chans
        if (chans && chans[0]) {
          const a = Math.floor(view.start)
          const top = chans[0]
          const bottom = chans[1] ?? chans[0]
          cx.strokeStyle = COLOURS.wave
          cx.lineWidth = 1
          cx.beginPath()
          for (let i = 0; i < top.length; i++) {
            const x = xOf(a + i)
            const y = mid - (top[i]! / 32768) * amp
            i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y)
          }
          cx.stroke()
          if (bottom !== top) {
            cx.strokeStyle = 'rgba(154,163,181,.5)'
            cx.beginPath()
            for (let i = 0; i < bottom.length; i++) {
              const x = xOf(a + i)
              const y = mid - (bottom[i]! / 32768) * amp
              i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y)
            }
            cx.stroke()
          }
          if (1 / spp > 6) {
            cx.fillStyle = '#e6e6e6'
            for (let i = 0; i < top.length; i++) cx.fillRect(xOf(a + i) - 1, mid - (top[i]! / 32768) * amp - 1, 2, 2)
          }
        }
        cx.strokeStyle = COLOURS.axis
        cx.beginPath(); cx.moveTo(0, mid); cx.lineTo(W, mid); cx.stroke()
      }

      // regions: highlight and labels (the plugin draws the base fill).
      // Labels sit on the top row; a label only drops a row when it would overlap one already drawn.
      const list = ordered(st)
      cx.font = '11px ui-monospace, Menlo, monospace'
      const rows: { x0: number; x1: number }[][] = []
      list.forEach((r) => {
        const x0 = xOf(r.start)
        const x1 = xOf(r.end)
        if (x1 < 0 || x0 > W) return
        const act = r.id === st.activeId && st.mode === 'select'
        const sel = st.selected.includes(r.id)
        if (act) {
          cx.fillStyle = COLOURS.active
          cx.fillRect(x0, 0, Math.max(1, x1 - x0), H)
        }
        cx.strokeStyle = act ? COLOURS.activeLine : COLOURS.regionLine
        cx.lineWidth = act ? 2 : 1
        cx.strokeRect(x0 + 0.5, 0.5, Math.max(1, x1 - x0) - 1, H - 1)
        cx.fillStyle = act ? COLOURS.activeLine : COLOURS.regionText
        const label = (sel ? '[x] ' : '') + displayName(st, r) + (r.name == null ? ' (auto)' : '')
        const lx0 = x0 + 4
        const lx1 = lx0 + cx.measureText(label).width + 6
        let row = 0
        while (rows[row]?.some((o) => lx0 < o.x1 && lx1 > o.x0)) row++
        ;(rows[row] ??= []).push({ x0: lx0, x1: lx1 })
        cx.fillText(label, lx0, 12 + row * 12)
      })

      // ruler
      cx.fillStyle = COLOURS.ruler
      cx.font = '10px ui-monospace, Menlo, monospace'
      const secs = view.win / sr
      const step = secs > 600 ? 60 : secs > 120 ? 10 : secs > 12 ? 2 : secs > 5 ? 1 : secs > 1.5 ? 0.25 : secs > 0.3 ? 0.05 : secs > 0.05 ? 0.01 : 0.001
      for (let t = Math.ceil(view.start / sr / step) * step; t * sr < view.start + view.win; t += step) {
        const x = xOf(t * sr)
        cx.fillRect(x, H - 14, 1, 4)
        cx.fillText(t.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) + 's', x + 2, H - 4)
      }

      // draft
      if (st.mode === 'insert' && st.draft) {
        const d = st.draft
        cx.fillStyle = COLOURS.draft
        cx.fillRect(xOf(d.start), 0, Math.max(1, xOf(d.end) - xOf(d.start)), H)
        for (const side of ['start', 'end'] as const) {
          const x = xOf(d[side])
          const act = d.active === side
          cx.strokeStyle = act ? COLOURS.anchor : COLOURS.anchorDim
          cx.lineWidth = act ? 2 : 1
          cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke()
          cx.fillStyle = act ? COLOURS.anchor : COLOURS.anchorDim
          cx.beginPath()
          if (side === 'start') { cx.moveTo(x, 0); cx.lineTo(x + 9, 0); cx.lineTo(x, 9) } else { cx.moveTo(x, 0); cx.lineTo(x - 9, 0); cx.lineTo(x, 9) }
          cx.fill()
          cx.font = '11px ui-monospace, Menlo, monospace'
          cx.fillText(side + (act ? ' (active)' : ''), side === 'start' ? x + 4 : x - 72, H - 20)
        }
      }

      // playhead, Playhead mode only
      if (st.mode === 'playhead') {
        const px = xOf(st.playhead)
        cx.strokeStyle = COLOURS.playhead
        cx.lineWidth = 2
        cx.beginPath(); cx.moveTo(px, 0); cx.lineTo(px, H); cx.stroke()
        if (st.returnPoint != null) {
          cx.fillStyle = COLOURS.playhead
          cx.font = '10px ui-monospace, Menlo, monospace'
          cx.fillText('return', xOf(st.returnPoint) + 4, H - 32)
        }
      }

      // play cursor, coloured by kind
      const pc = cursorRef.current()
      if (pc) {
        const x = xOf(pc.frame)
        const colour = COLOURS.cursor[pc.kind]
        cx.setLineDash([4, 3])
        cx.strokeStyle = colour
        cx.lineWidth = pc.kind === 'playhead' ? 1 : 2
        cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke()
        cx.setLineDash([])
        if (pc.kind !== 'playhead') {
          cx.fillStyle = colour
          cx.font = '10px ui-monospace, Menlo, monospace'
          cx.fillText(pc.kind, x + 4, 22)
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [source])

  return (
    <div ref={box} className="wave">
      <div ref={wsBox} className="wave-ws" />
      <canvas
        ref={canvas}
        className="wave-overlay"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          dispatch({ type: 'seekTo', frame: frameOf(e.clientX) })
        }}
        onPointerMove={(e) => { if (dragging.current) dispatch({ type: 'seekTo', frame: frameOf(e.clientX) }) }}
        onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId) }}
        onPointerCancel={() => { dragging.current = false }}
      />
    </div>
  )
}
