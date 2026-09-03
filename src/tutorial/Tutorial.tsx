import { useState } from 'react'
import { walkthroughs, keymap, replayStep } from './walkthroughs'

/**
 * The tutorial panel: the six walkthroughs as numbered steps with "Do it for
 * me" buttons that replay the same key events through the real listener,
 * plus the keymap reference. Toggled with `?`.
 */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(0)
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const names = [...walkthroughs.map((w) => w.title), 'Keymap']

  return (
    <div className="panel tutorial">
      <div className="tabs">
        {names.map((n, i) => (
          <button key={n} className={i === tab ? 'on' : ''} onClick={(e) => { setTab(i); (e.currentTarget as HTMLButtonElement).blur() }}>{n}</button>
        ))}
        <button className="close" onClick={onClose} title="Close (?)">close</button>
      </div>
      {tab < walkthroughs.length ? (
        <div>
          <p className="note">{walkthroughs[tab]!.intro}</p>
          {walkthroughs[tab]!.steps.map((st, si) => {
            const key = `${tab}:${si}`
            return (
              <div key={key} className={'step' + (done[key] ? ' done' : '')}>
                <span className="n">{si + 1}</span>
                <span className="t">{st.text}</span>
                <button
                  className="do"
                  disabled={busy}
                  onClick={async (e) => {
                    (e.currentTarget as HTMLButtonElement).blur()
                    setBusy(true)
                    try { await replayStep(st.keys) } finally { setBusy(false) }
                    setDone((d) => ({ ...d, [key]: true }))
                  }}
                >
                  Do it for me
                </button>
              </div>
            )
          })}
          <p className="note" style={{ marginTop: 8 }}>Or just press the keys. The buttons replay the same key events.</p>
        </div>
      ) : (
        <div>
          {Object.entries(keymap).map(([mode, rows]) => (
            <div key={mode}>
              <h2 style={{ marginTop: 10 }}>{mode}</h2>
              <table className="km">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r[0]}><td><kbd>{r[0]}</kbd></td><td>{r[1]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
