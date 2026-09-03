# Source module: WAV fast path, decoded path, peaks

Type: task
Status: claimed
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
