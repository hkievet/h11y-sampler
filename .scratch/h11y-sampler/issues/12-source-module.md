# Source module: WAV fast path, decoded path, peaks

Type: task
Status: resolved
Blocked by: 

## Question

Build the Source module from the spec and `research/decode-and-memory-pipeline.md`:
`openSource(file)` returning `frames`, `sampleRate`, `channels`,
`peaks(buckets, range)`, `window(range)` (Int16 per channel),
`slice(range)` (a complete WAV Blob), and `media()`. `WavSource` parses
PCM, float, and extensible WAV with RF64 and skips `JUNK`/`bext`/`iXML`;
`slice` is a rewritten header plus a `File.slice` byte range with the
`fmt ` chunk copied verbatim, never loading the data chunk. `DecodedSource`
decodes on an AudioContext at the container's rate, converts to Int16 in
chunks, drops the AudioBuffer, and slices to 16-bit PCM; toast above 60
minutes. Seam B tests: fixture generators for 16-bit, 24-bit, float, and
JUNK-chunk WAVs, header parsing, and byte-exact `slice` output. Wire the
drop zone in the Shell so a real file replaces the stand-in Source and
the status bar shows its length. Leaves the app runnable.

## Answer

Done 2026-09-03, one commit.

- `src/source/`: `types.ts` (the `Source` interface in frames, `SourceInfo`,
  `FrameRange`), `peaks.ts` (a 64-frame min/max Int16 level with
  `rebucket`, plus `bucketRaw` for finer zooms), `wav.ts` (`parseWav`
  chunk walker with RF64 `ds64`, JUNK/bext/iXML skipping, pad bytes,
  truncation to whole frames; `readFrames` for 8/16/24/32-bit PCM and
  32/64-bit float; `chopHeader` copying the original `fmt ` chunk
  verbatim, adding `fact` for float and a pad byte for odd bodies;
  `WavSource` whose `slice` is header plus `File.slice`, never loading
  the data chunk), `decoded.ts` (`sniffSampleRate` for FLAC, MP3 with
  ID3, MP4 `mp4a`, Ogg Opus/Vorbis; `DecodedSource.open` decoding on an
  `OfflineAudioContext` at that rate, chunked Int16 conversion building
  the level in the same pass, AudioBuffer dropped; 16-bit PCM `slice`),
  `index.ts` (`openSource` sniffing bytes, never extension;
  `WARN_ABOVE_SECONDS`).
- 20 Seam B tests in `src/source/wav.test.ts` on a fixture generator
  covering 16-bit, 24-bit extensible, float with `fact`, 8-bit odd
  bodies, JUNK and odd-sized chunks, RF64, truncation, data beyond the
  first megabyte, byte-equal Chop bodies, `window`, `peaks` at both
  resolutions, progress, and the rate sniffers. 53 tests total, green.
- `src/DropZone.tsx` and the Shell: drag-and-drop or picker, progress
  while peaks build, warning toast above 60 minutes or on truncation,
  header shows name, duration, rate, channels, and passthrough format.
  The Core is initialised from `source.info`.

Not verified in this session: the drop in a real browser (the Chrome
extension was not connected). A 10-second stereo test WAV with a JUNK
chunk is at the session scratchpad as `field-test.wav`; the end-to-end
ticket covers this properly. Peaks for WAV run on the main thread in
4 MiB slices; a Worker is a later optimisation if a 1 GB drop feels
sluggish.
