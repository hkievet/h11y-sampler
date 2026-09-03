/**
 * The demo recording: the prototype's synthesized 30-second signal as a
 * 16-bit stereo WAV File, so the tutorial works before any file is dropped.
 * 0-10 s: a 55 Hz bass tone. 10-20 s: drum-like hits every half second.
 * 20-30 s: a 440 Hz tone with a slow tremolo (a loop seam is audible in it).
 */
export function demoFile(): File {
  const sr = 48000
  const frames = 30 * sr
  const bytes = new Uint8Array(44 + frames * 4)
  const dv = new DataView(bytes.buffer)
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) bytes[o + i] = s.charCodeAt(i) }
  put(0, 'RIFF'); dv.setUint32(4, 36 + frames * 4, true); put(8, 'WAVE')
  put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true)
  put(36, 'data'); dv.setUint32(40, frames * 4, true)
  let seed = 12345
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let i = 0; i < frames; i++) {
    const t = i / sr
    let v = 0
    if (t < 10) v = 0.5 * Math.sin(2 * Math.PI * 55 * t) + 0.05 * Math.sin(2 * Math.PI * 220 * t)
    else if (t < 20) {
      const local = (t - 10) % 0.5
      const n = Math.floor((t - 10) / 0.5)
      if (local < 0.25) {
        const env = Math.exp(-local / 0.03)
        const env2 = Math.exp(-local / 0.08)
        const noise = (rand() * 2 - 1) * env * (n % 2 ? 0.25 : 0.6)
        const f = 60 + 140 * Math.exp(-local / 0.02)
        v = noise + (n % 2 ? 0.6 : 0.3) * env2 * Math.sin(2 * Math.PI * f * local * (1 + n * 0.07))
      }
    } else v = 0.4 * Math.sin(2 * Math.PI * 440 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t))
    const s16 = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
    dv.setInt16(44 + i * 4, s16, true)
    dv.setInt16(46 + i * 4, s16, true)
  }
  return new File([bytes], 'demo.wav', { type: 'audio/wav', lastModified: 0 })
}
