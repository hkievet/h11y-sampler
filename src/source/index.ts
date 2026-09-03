import { DecodedSource } from './decoded'
import { WavSource, openWav } from './wav'
import type { OpenOptions, Source } from './types'

export type { Source, SourceInfo, FrameRange, SampleFormat, OpenOptions } from './types'
export { basename } from './types'

/**
 * Open a dropped file as a Source. Sniffs the bytes, never the extension:
 * a RIFF/RF64 WAVE file with PCM or float samples takes the byte-exact
 * fast path; everything else is decoded by the browser.
 */
export async function openSource(file: File, opts: OpenOptions = {}): Promise<Source> {
  const layout = await openWav(file)
  if (layout) return new WavSource(file, layout, opts)
  return DecodedSource.open(file, opts)
}

/** Soft ceiling from the map: warn, never refuse. */
export const WARN_ABOVE_SECONDS = 60 * 60
