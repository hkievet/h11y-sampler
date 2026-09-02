# Decode and memory pipeline for a 60-minute Source

Type: research
Status: resolved
Blocked by:

## Question

Confirm the audio pipeline for a 60-minute Source in Chrome:

1. PCM WAV fast path: RIFF/WAVE parsing (PCM, IEEE float, WAVE_FORMAT_EXTENSIBLE,
   24-bit packing, RF64 or 4 GB+ files from recorders), sample-aligned byte
   slicing into a new WAV with a rewritten header, and reading via
   `File.slice` so the whole file never sits on the heap.
2. Compressed path: `decodeAudioData` of a 60-minute MP3/FLAC/M4A, peak
   memory during decode, and converting to interleaved Int16 then dropping
   the AudioBuffer. Is 60 minutes stereo comfortably within Chrome's
   limits on a 16 GB machine?
3. Peaks: computing display peaks from our own decode and handing
   `peaks` + `duration` to wavesurfer's `loadBlob` so it skips its own
   8 kHz decode. Confirm the API shape in wavesurfer 7.12.
4. Sample-accurate boundaries: Region times in seconds to sample index,
   rounding rule, and zero-crossing search cost.

Deliver findings in `research/decode-and-memory-pipeline.md` with a
recommended module boundary between "Source" (decode, slice, peaks) and
the UI.

## Answer

Findings: [research/decode-and-memory-pipeline.md](../research/decode-and-memory-pipeline.md)
(File API spec, Chromium blob and Web Audio source, EBU 3306 for RF64,
wavesurfer 7.12 source; memory table for 44.1k/48k in Int16/Int24/Float32
is in the doc).

- **WAV fast path is safe and heap-free.** A Chop is
  `new Blob([header, file.slice(a, b)])`; a File slice is a byte-range
  reference, not a copy. Copy the original `fmt ` chunk verbatim for
  byte-exact 24-bit, float, and extensible passthrough; add a `fact`
  chunk for float. RF64 is a `ds64` chunk after the header with 64-bit
  sizes and `0xFFFFFFFF` sentinels. The chunk walker must skip `JUNK`,
  `bext`, `iXML`.
- **Compressed path fits on 16 GB.** Chromium's `decodeAudioData` holds
  roughly two float copies plus the encoded input, so peak is about
  2.9 GB for 60 minutes stereo at 48k, settling to 0.69 GB as Int16
  after chunked `copyFromChannel` conversion and dropping the
  AudioBuffer. No hard cap is near. Trap: decode resamples to the
  context rate, so sniff the container's sample rate first and create
  the AudioContext at that rate.
- **wavesurfer must be fed peaks.** `loadBlob(blob, peaks, duration)`
  skips decode when `peaks` (per-channel arrays in -1..1) is provided.
  Its default 8 kHz decode is a full-rate `decodeAudioData` plus
  resample, so it costs the same 2.9 GB transient. `setOptions({peaks,
  duration})` re-supplies peaks on zoom.
- **Frames are the unit of truth.** Seconds are derived as
  `frame / rate` and recovered with `Math.round`, exact below 172.8M
  frames. Zero-crossing search over ±10 ms is about 1,000 Int16 values
  or a 3 to 6 KB File slice, sub-millisecond either way.
- **Module boundary:** a `Source` interface in frames with `peaks(buckets,
  range)`, `window(range)`, `slice(range): Blob`, `media()`, implemented by
  `WavSource` and `DecodedSource` behind `openSource(file)`, with no React
  or wavesurfer imports.
- **Cross-ticket:** the Blink width cap means wavesurfer zoom tops out
  near 9,300 px/s (about 5 samples per pixel) on a 60-minute Source.
  Sample-level views need a separate detail strip fed by `window(range)`.
