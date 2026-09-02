# Decode and memory pipeline for a 60-minute Source

Resolves ticket `issues/02-decode-and-memory-pipeline.md`. Date: 2026-09-02.
Target: Chrome, 16 GB machine, Sources up to 60 minutes, usually PCM WAV
from field recorders, sometimes MP3/FLAC/M4A. Output WAV matching the Source.

Sources were read directly: wavesurfer.js at tag `7.12.0`, Chromium `main`
and V8 `main` via chromium.googlesource.com, the Web Audio and File API
specs, MDN, Microsoft `mmreg.h` docs, the McGill transcription of the
Microsoft/IBM RIFF WAVE spec, and EBU Tech 3306 v1.1 (RF64). Anything not
traceable to one of those is marked **recommendation**.

## Summary

1. **WAV fast path is safe and cheap.** A Chop is `new Blob([header,
   file.slice(a, b)])`; the slice is a byte-range reference, not a copy, in
   both the File API spec and Chromium's blob store. Nothing of the Source
   ever needs to be on the heap except the header and whatever windows we
   read for peaks and zero-crossings. RF64 needs ~20 lines of extra parsing.
2. **Compressed path fits but is not free.** Chrome's `decodeAudioData`
   holds, transiently, two full-length float32 copies plus the encoded
   bytes (about 2.9 GB for 60 min stereo 48k), then hands back a third
   copy as the `AudioBuffer` (1.38 GB). Converting that to interleaved
   Int16 in chunks and dropping the `AudioBuffer` lands at 0.69 GB steady
   state. All allocations are far under V8's per-buffer cap (32 GB under
   the sandbox). On 16 GB this is comfortable; on 8 GB it is workable.
   The one trap: `decodeAudioData` resamples to the context's rate, so the
   Source module must read the container's sample rate first and create
   the context at that rate, or "export at the Source rate" is violated.
3. **wavesurfer 7.12 `loadBlob(blob, peaks, duration)` skips decode
   entirely** when `peaks` is given; `peaks` is `Array<Float32Array |
   number[]>` per channel in -1..1 and `duration` is seconds. The renderer
   treats the peaks array as samples and draws `max|value|` per pixel, so
   the array should have about as many entries as the waveform has pixels.
   Its default 8 kHz decode is a full-rate `decodeAudioData` plus a
   resample, i.e. the same ~2.9 GB transient we are avoiding, so passing
   peaks is mandatory for 60-minute Sources, not an optimisation.
4. **Frames are the unit of truth.** Regions should be stored as integer
   frame indices; seconds are derived for wavesurfer and converted back
   with `Math.round`, which round-trips exactly at these magnitudes.
   Zero-crossing search touches a few hundred frames and is a
   sub-millisecond read on either path.
5. **A limit worth knowing now:** Chrome's layout engine caps element
   widths at 2^25 px, so wavesurfer's scroll-zoom cannot reach one pixel
   per sample for a 60-minute Source (max ~9,300 px/s, ~5 samples/px).
   The keymap's "one sample when zoomed in" needs a windowed view served by
   the Source module, not wavesurfer's global zoom. This belongs to
   tickets 03 and 09 but it shapes the module boundary below.

## Memory table (60 minutes, stereo)

| Rate | Frames | Int16 interleaved | Int24 (WAV source) | Float32 (AudioBuffer) |
|---|---|---|---|---|
| 44.1 kHz | 158,760,000 | 635,040,000 B = 605.6 MiB (0.64 GB) | 952,560,000 B = 908.4 MiB (0.95 GB) | 1,270,080,000 B = 1211.2 MiB (1.27 GB) |
| 48 kHz | 172,800,000 | 691,200,000 B = 659.2 MiB (0.69 GB) | 1,036,800,000 B = 988.8 MiB (1.04 GB) | 1,382,400,000 B = 1318.4 MiB (1.38 GB) |

Per channel, Float32 is 605.6 MiB (44.1k) / 659.2 MiB (48k). Encoded input
for reference: MP3 320 kbps = 144 MB, 128 kbps = 57.6 MB, FLAC roughly
0.5-0.7 of the Int16 figure.

Peak-memory timeline for the compressed path in Chrome (derived from the
source walk in section 2):

| Moment | Live buffers | 48k stereo |
|---|---|---|
| `blob.arrayBuffer()` done | encoded bytes | 0.14 GB (320k MP3) |
| inside FFmpeg read | encoded + packet vector (float planar, full length) | 0.14 + 1.38 GB |
| copying packets into the output bus | encoded + packets + bus | 0.14 + 1.38 + 1.38 = **2.90 GB** |
| resample step, only if context rate differs | + destination bus | + up to 1.38 GB (avoid) |
| promise resolves | bus (released just after) + `AudioBuffer` | 1.38 + 1.38 = 2.76 GB |
| our Int16 conversion (chunked) | `AudioBuffer` + Int16 | 1.38 + 0.69 = 2.07 GB |
| `AudioBuffer` dropped and GC'd | Int16 + peaks | ~0.69 GB + ~0.02 GB |

Peaks pyramid at 1/64 (min and max as Int16, stereo): 18.9 MiB (44.1k),
20.6 MiB (48k). At 1/4096: 0.3 MiB. wavesurfer's own 8 kHz decode would hold
109.9 MiB per channel of float for the life of the page.

## 1. PCM WAV fast path

### RIFF/WAVE layout

- File starts with `RIFF`, uint32 LE size (`4 + n`), `WAVE`, then chunks.
  Every chunk is `ckID[4]`, `cksize` uint32 LE, data, and **a pad byte if
  the size is odd**. [McGill WAVE][mcgill]
- `fmt ` chunk size is 16, 18 or 40: `wFormatTag u16`, `nChannels u16`,
  `nSamplesPerSec u32`, `nAvgBytesPerSec u32`, `nBlockAlign u16`,
  `wBitsPerSample u16`, then optional `cbSize u16` and extension. [McGill
  WAVE][mcgill], [WAVEFORMATEX][waveformatex]
- `nBlockAlign = nChannels * wBitsPerSample / 8` for PCM and IEEE float; it
  is "the size of a single audio frame" and I/O "should always start at the
  beginning of a block". [WAVEFORMATEX][waveformatex]
- Sample packing: little-endian; 8-bit and below unsigned; 9 bits and above
  two's-complement signed, **left-justified in the container** (so 20 valid
  bits in a 24-bit container occupy the top 20 bits). 24-bit is three
  bytes per sample, no padding. [McGill WAVE][mcgill]
- Format tags: `1` = `WAVE_FORMAT_PCM`, `3` = `WAVE_FORMAT_IEEE_FLOAT`
  (full scale 1.0, 32 or 64 bits), `0xFFFE` = `WAVE_FORMAT_EXTENSIBLE`.
  [McGill WAVE][mcgill], [WAVEFORMATEX][waveformatex]
- `WAVE_FORMAT_EXTENSIBLE` is required when PCM exceeds 16 bits, channels
  exceed 2, valid bits differ from the container, or a speaker map is
  needed. So **every 24-bit recorder file should be extensible**, though
  many writers use tag 1 with 24 bits anyway; accept both. [McGill
  WAVE][mcgill], [WAVEFORMATEX remarks][waveformatex]
- Extensible extension (`cbSize` must be >= 22): `wValidBitsPerSample u16`
  (any value not exceeding the container), `dwChannelMask u32`, `SubFormat`
  GUID 16 bytes. The GUID is the 16-bit format code followed by the fixed
  14 bytes `00 00 00 00 10 00 80 00 00 AA 00 38 9B 71`. So PCM subformat is
  `01 00 00 00 00 00 10 00 80 00 00 AA 00 38 9B 71` and IEEE float is
  `03 00 ...`. [WAVEFORMATEXTENSIBLE][wfext], [McGill WAVE][mcgill]
- Non-PCM formats (IEEE float included) "must have a `fact` chunk" with
  `dwSampleLength` = frames per channel, and their `fmt ` chunk must carry
  a `cbSize` field even if 0. [McGill WAVE][mcgill]

### RF64 (recorders that pass 4 GB)

EBU Tech 3306 v1.1, Annex A. [EBU 3306][rf64]

- `RIFF` becomes `RF64`; the 32-bit size field is `0xFFFFFFFF`. A `ds64`
  chunk **must be the first chunk after the RF64 header**.
- `ds64` layout: `chunkId 'ds64'`, `chunkSize u32`, `riffSizeLow/High`,
  `dataSizeLow/High`, `sampleCountLow/High` (all u32 pairs = u64),
  `tableLength u32`, then `tableLength` entries of `{chunkId[4],
  chunkSizeLow u32, chunkSizeHigh u32}` for any other chunk over 4 GB.
- Rule: "If the 32-bit value in the field is not -1 (= FFFFFFFF hex) then
  this 32-bit value is used. If the 32-bit value in the field is -1 the
  64-bit value in the ds64 chunk is used instead."
- Recorders pre-allocate a `JUNK` chunk of at least 28 bytes right after
  the header and rename it to `ds64` when the file crosses 4 GB. So a
  normal RIFF file from the same recorder usually has a `JUNK` chunk first;
  the chunk walker must skip unknown chunks (`JUNK`, `bext`, `iXML`,
  `LIST`, `cue `, `PAD `, ...) rather than assume `fmt ` is first.

Reading `dataSize` as a u64 from `ds64` and everything else identically is
the whole RF64 delta. A 60-minute stereo 24-bit 48k file is 1.04 GB, so
RF64 only appears with high channel counts or 32-bit float at high rates
(stereo float 192k for 60 min is 5.5 GB). **Recommendation:** parse it, do
not special-case it further.

### Robustness (recommendation, from field-recorder behaviour, not a spec)

- If `data` size is `0` or runs past end of file (recorder lost power),
  treat the data chunk as running to EOF, truncated to a whole
  `nBlockAlign`. Expose this as a `truncated: true` flag so the UI can say
  so.
- Reject (fall through to the decode path) any format tag other than
  1, 3, or 0xFFFE with PCM/float subformat. Chrome's FFmpeg-based decoder
  will handle ADPCM, u-law, and MP3-in-WAV via `decodeAudioData`.
- Read only the first ~1 MB via `file.slice(0, 1 << 20).arrayBuffer()` for
  the chunk walk; if `data` is not found, continue slicing forward. `bext`
  and `iXML` are a few KB; `LIST` is small.

### Slicing a Chop without touching the heap

- `Blob.slice(start, end)` "returns a new Blob object ... with bytes ranging
  from start up to but not including end" that "refers to span consecutive
  bytes from blob's associated byte sequence"; a `File` from the OS "is a
  reference to a byte sequence from a file from the underlying file
  system". [File API][fileapi]
- Chromium stores a sliced file-backed blob as a `BlobDataItem` of type
  `kFile` with `offset_`, `length_`, `path_` and an
  `expected_modification_time_`; only `kBytes` items hold a
  `std::vector<uint8_t>`. [blob_data_item.h][blobitem] So a slice of a
  dropped `File` is a `(path, offset, length)` record until something
  reads it.
- Reading, downloading via `URL.createObjectURL`, or `Blob.stream()` then
  pulls bytes from disk. If the file changed on disk since the drop, reads
  fail with `NotReadableError` (snapshot state). [File API][fileapi]
  **Recommendation:** catch that on export and tell the user to re-drop.

Chop construction (recommendation, follows directly from the spec facts):

```
byteStart = dataOffset + startFrame * blockAlign
byteEnd   = dataOffset + endFrame   * blockAlign          // end exclusive
body      = file.slice(byteStart, byteEnd)                // no copy
header    = RIFF(4 + fmtChunkBytes + factChunkBytes + 8 + body.size [+1 pad])
            + original 'fmt ' chunk bytes, verbatim
            + 'fact' chunk (frames) when tag is 3 or extensible-float
            + 'data' + u32(body.size)
chop      = new Blob([header, body, pad?], { type: 'audio/wav' })
```

Copying the original `fmt ` chunk verbatim is what makes passthrough
byte-exact for 24-bit, float, extensible, and `wValidBitsPerSample < 24`
files without re-deriving anything. `blockAlign` makes every boundary
sample-aligned by construction. The pad byte only arises for 8-bit mono
with an odd frame count; keep the branch anyway.

`JSZip` accepts a `Blob` as file content; whether `generateAsync` streams
file-backed inputs or buffers everything belongs to ticket 04 (batch
export); note only that a single `E` export never needs JSZip.

## 2. Compressed path: `decodeAudioData` in Chrome

### What the spec and MDN say

- `decodeAudioData(arrayBuffer)` detaches the input; an already-detached
  buffer rejects with `DataCloneError`; undecodable data rejects with
  `EncodingError`; decoding runs on a separate decoding thread; the decoded
  linear PCM is **resampled to the context's sample rate** if they differ.
  [Web Audio spec][wa-decode] MDN says the same about resampling and is
  silent on memory. [MDN decodeAudioData][mdn-decode]
- `AudioBuffer` stores each channel as 32-bit float; at least 32 channels
  must be supported; `length >= 1`; `sampleRate` must be within the
  supported range (spec floor: 8 kHz to 96 kHz). [Web Audio spec][wa-decode],
  [MDN createBuffer][mdn-createbuffer]
- Chrome shipped "decodeAudioData detaches ArrayBuffer" in Chrome 59, with
  the guidance to `slice(0)` first if the original is still needed.
  [chromestatus 5539919174828032][chromestatus]

### What Chromium actually does (source walk, `main` as of 2026-09-02)

`BaseAudioContext::decodeAudioData` [base_audio_context.cc][bac]:

- Calls `audio_data->Transfer(isolate, buffer_contents, ...)`, so the JS
  `ArrayBuffer` is detached and its backing store moves to the decode
  task; a detached input is rejected with `kDataCloneError "Cannot decode
  detached ArrayBuffer"`.
- Posts `DecodeOnBackgroundThread(audio_data_contents, sampleRate(), ...)`
  to a worker pool. That calls
  `AudioBus::CreateBusFromInMemoryAudioFile(data, /*mix_to_mono=*/false,
  sample_rate)`.
- `CreateBusFromInMemoryAudioFile` calls `DecodeAudioFileData`, and returns
  the bus as-is only if `audio_bus->SampleRate() == sample_rate`;
  otherwise `TryCreateBySampleRateConverting` allocates a second,
  destination-length bus. [audio_bus.cc][audiobus]
- `content::DecodeAudioFileData` [audio_decoder.cc][contentdec] opens the
  bytes with FFmpeg through `media::AudioFileReader`, sanity-checks
  channels (`<= 32`) and rate (`3000..768000`) [limits.h][limits], then
  `reader->Read(&decoded_audio_packets)` fills a
  `std::vector<std::unique_ptr<media::AudioBus>>` with **every decoded
  packet of the whole file** as planar float (`AudioBuffer::
  WrapOrCopyToAudioBus` per packet) [audio_file_reader.cc][afr]. It then
  allocates a `WebAudioBus` of `number_of_frames` and copies every packet
  into it channel by channel. The packet vector is not freed until the
  function returns, so **two full-length float copies coexist** here.
- Back on the main thread, `NotifyDecodingComplete` calls
  `AudioBuffer::CreateFromAudioBus(bus)`, whose constructor allocates one
  `DOMFloat32Array` per channel and `copy_from`s the bus data. The bus
  reference is held by the callback until that returns, so the bus and
  the new `AudioBuffer` coexist briefly. [audio_buffer.cc][audiobuffer],
  [base_audio_context.cc][bac]
- `AudioBuffer::Create` rejects `number_of_frames == 0`, more than 32
  channels, and rates outside 3000..768000 Hz; a failed channel allocation
  surfaces as `NotSupportedError` ("createBuffer(...) failed") rather than
  a crash. [audio_buffer.cc][audiobuffer], [audio_utilities.cc][audioutil]
  MDN documents the allocation failure as a `RangeError`; Chromium's code
  throws `NotSupportedError`. Handle both.

### Limits that could bite, and do not

- V8 `ArrayBuffer::kMaxByteLength` is 2^53-1 on 64-bit, or 32 GB-1 when
  the V8 sandbox is on (it is, in desktop Chrome);
  `Float32Array::kMaxLength = kMaxByteLength / 4`. [v8-array-buffer.h][v8ab],
  [v8-typed-array.h][v8ta], [v8-internal.h][v8int]. Our largest single
  allocation is 659 MiB.
- `AudioBuffer.length` is `uint32_t` in Blink [audio_buffer.cc][audiobuffer];
  172.8M frames is 4% of that. The resampler additionally requires the
  destination length to fit in `int`. [audio_bus.cc][audiobus]
- ArrayBuffer backing stores and `AudioBuffer` channel data are allocated
  outside the V8 JS heap (through `v8::ArrayBuffer::Allocator`), so the
  ~4 GB V8 heap limit does not apply to them. [v8-array-buffer.h][v8ab]
- Historical Chromium bugs about `decodeAudioData` on large inputs
  ([crbug 176902][crbug176902] tab crash on Windows, 2013; [crbug
  400023][crbug400023] "memory leak with large audio source") date from
  before detach shipped in Chrome 59 and are consistent with the
  copy-count above rather than with any hard cap.

### Verdict for question 2

60 minutes stereo is **comfortably within Chrome's limits on 16 GB**:
peak ~2.9 GB of off-heap memory for a few seconds, then 2.1 GB during
conversion, then ~0.7 GB. No single buffer approaches any cap. Two
consequences shape the module:

1. **Read the sample rate before decoding.** Because Chrome resamples to
   the context's rate, `new AudioContext()` (hardware rate, often 48k)
   would silently turn a 44.1k MP3 into 48k, breaking "export at the Source
   rate", and add a fourth full-length buffer during decode. The Source
   module must sniff the rate from the container (MP3 frame header, FLAC
   `STREAMINFO`, MP4 `stsd`/`esds`) and create
   `new OfflineAudioContext(1, 1, rate)` or `new AudioContext({ sampleRate:
   rate })` for the decode. wavesurfer's own `Decoder.decode` does exactly
   this with a throwaway `AudioContext({ sampleRate })` closed in
   `finally`. [wavesurfer decoder.ts][ws-decoder]
   If sniffing fails, decode at 48k and record the export rate as 48k
   honestly.
2. **Convert to Int16 in chunks and drop the AudioBuffer.** Use
   `copyFromChannel(chunk, ch, offset)` with a ~1 s chunk per channel into
   a preallocated `Int16Array(frames * channels)`, interleaving as you go,
   then null every reference to the `AudioBuffer`. This keeps peak at
   `float32 + int16` rather than `2 * float32 + int16`. Compute the peaks
   pyramid from the same chunks in the same pass so the float data is read
   once. Clamp and round: `Math.max(-32768, Math.min(32767,
   Math.round(x * 32767)))` (recommendation; any consistent rule is fine
   as long as export uses the same one).
3. **Playback of a decoded Source does not need the Int16 buffer**: the
   original MP3/FLAC/M4A `Blob` can be given to the `<audio>` element.
   That is ticket 08's call; noted here because it means the Int16 buffer
   exists only for export, peaks at high zoom, and zero-crossing search.

Mono downmix at load time (listed under "Not yet specified" in the map) is
not needed for the 60-minute case; leave it unspecified.

## 3. Peaks and wavesurfer 7.12

### API shape (verbatim from `src/wavesurfer.ts` at tag 7.12.0)

```ts
/** Pre-computed audio data, arrays of floats for each channel */
peaks?: Array<Float32Array | number[]>
/** Pre-computed audio duration in seconds */
duration?: number
/** Decoding sample rate. Doesn't affect the playback. Defaults to 8000 */
sampleRate?: number

public async load(url: string, channelData?: WaveSurferOptions['peaks'], duration?: number)
public async loadBlob(blob: Blob, channelData?: WaveSurferOptions['peaks'], duration?: number)
public getDecodedData(): AudioBuffer | null
public exportPeaks({ channels = 2, maxLength = 8000, precision = 10_000 } = {}): Array<number[]>
public setOptions(options: Partial<WaveSurferOptions>)
```

[wavesurfer.ts][ws-main]

### Behaviour that matters

- `loadAudio` sets the media element source to the blob (`setSrc(url,
  blob)`), waits for a duration (`duration` argument, else the element's
  `loadedmetadata`), then: **if `channelData` is provided,
  `Decoder.createBuffer(channelData, audioDuration)` is used and no
  decode happens; otherwise `blob.arrayBuffer()` then
  `Decoder.decode(arrayBuffer, this.options.sampleRate)`.** [ws-main]
- `Decoder.decode` creates `new AudioContext({ sampleRate })` (default
  8000) and calls `decodeAudioData`. Per section 2 this is a full-rate
  FFmpeg decode of the whole file (2 x float32 copies) **plus** a
  resample to 8 kHz. For a 60-minute WAV that is the same ~2.9 GB
  transient as decoding an MP3, and it leaves a 110 MiB float array per
  channel resident. Passing `peaks` is therefore required for this
  product, not a nicety. [ws-decoder]
- `Decoder.createBuffer(channelData, duration)` normalises **in place**
  (divides every channel by the first channel's max abs, only if any value
  is outside -1..1), converts `number[]` to `Float32Array`, and returns an
  `AudioBuffer`-like object with `length = channelData[0].length`,
  `sampleRate = length / duration`. Hand it `Float32Array`s already in
  -1..1 and it neither copies nor scales. [ws-decoder]
- The renderer draws channel 0 above the axis and channel 1 (or channel 0
  again) below it unless `splitChannels`; for each pixel it takes
  `max(abs(value))` over the entries mapping to that pixel
  (`hScale = width / length`), so the peaks array is read as **one
  non-negative magnitude per entry**, signed values are folded by
  `Math.abs`. Handing it `max(|min|, |max|)` per bucket is exact.
  [renderer-utils.ts][ws-utils], [renderer.ts][ws-renderer]
- Canvas width is `ceil(duration * minPxPerSec)` (or the container width
  when smaller); canvases are cut at `MAX_CANVAS_WIDTH = 8000` and drawn
  lazily (current +/- 1) on scroll, with a `MAX_NODES = 10` cleanup. So
  the DOM side scales fine; only the peaks array must cover the whole
  width. [ws-utils], [ws-renderer]
- `setOptions({ peaks, duration })` rebuilds the buffer and re-renders; this
  is the hook for re-supplying peaks after a zoom change. `zoom(minPxPerSec)`
  only re-renders from the existing buffer. [ws-main]
- `exportPeaks` downsamples wavesurfer's own decoded data; with supplied
  peaks it just re-buckets them. Not useful to us. [ws-main]

### The zoom ceiling (affects tickets 03 and 09)

Blink's `LayoutUnit` is `FixedPoint<6, int32_t>`: 6 fractional bits, so
the largest representable length is 2^31 / 64 = **33,554,432 px**.
[layout_unit.h][layoutunit] wavesurfer sets `wrapper.style.width =
scrollWidth px` with `scrollWidth = ceil(duration * minPxPerSec)`
[ws-utils], so for 3600 s the usable `minPxPerSec` tops out around
9,320 px/s, which is 4.7 samples per pixel at 44.1k and 5.2 at 48k. One
pixel per sample for the whole Source is not reachable through
wavesurfer's scroll zoom, and a peaks array for that zoom would be 33.5M
entries per channel (134 MiB) anyway.

**Recommendation:** cap wavesurfer's zoom at roughly 2,000 px/s (7.2M
entries per channel, 29 MiB as Float32, 22 samples/px at 44.1k) and serve
the "one second either side" / "one sample" views from a separate detail
strip fed by `Source.window(...)` below. Ticket 03 decides how that strip
coexists with the Regions plugin; ticket 09 decides what `{`/`}` mean at
that depth.

### Computing peaks

- Precompute a **pyramid**: per channel, per bucket of 64 frames, `min`
  and `max` as Int16 (18.9-20.6 MiB stereo), and a 1/4096 level (0.3 MiB)
  for the overview. Any zoom at or below 689-750 px/s is a cheap
  re-bucket of the 1/64 level; anything finer reads raw frames for the
  visible window only. [recommendation]
- WAV path: one streaming pass over the `File` in ~4 MiB slices,
  decoding bytes to Int16 magnitudes on the fly (8/16/24/32-bit int and
  float32/64 readers). 1 GB from local disk is a few seconds; run it in a
  Worker (a `File` is structured-cloneable) so the drop stays responsive,
  and post the pyramid back as transferables. [recommendation]
- Decoded path: fold the same bucketing into the Int16 conversion pass in
  section 2 so the float data is read once.
- Hand wavesurfer `Float32Array`s of `max(|min|, |max|) / 32768` per
  bucket, one per channel (two suffice; it ignores the rest unless
  `splitChannels`), with `duration = frames / sampleRate`.

## 4. Sample-accurate boundaries

- **Store Regions as frames, not seconds.** `{ startFrame: number,
  endFrame: number }`, end exclusive, integers, `0 <= start < end <=
  frames`. WAV byte offsets are then `dataOffset + frame * blockAlign` and
  are sample-aligned by construction (section 1).
- **Seconds are derived**: `seconds = frame / sampleRate`. Converting back
  from a double that came from us, or from a mouse position, use
  `frame = Math.round(seconds * sampleRate)` then clamp. At these
  magnitudes (frame <= 172.8M, well under 2^53) `Math.round(frame /
  rate * rate) === frame` for every integer frame, so the round trip is
  exact; only mouse-originated times actually round, and nearest-frame is
  the least surprising rule for a "drag the Playhead" gesture.
  [recommendation; the numeric fact is IEEE-754 double arithmetic]
- wavesurfer and the Regions plugin speak seconds; the UI converts at the
  boundary and never lets a seconds value become the source of truth.
- **Zero-crossing search cost** (quality rules are ticket 05's): a window
  of +/- 10 ms is 441-480 frames. On the decoded path that is a loop over
  ~1,000 Int16 values, microseconds. On the WAV path it is
  `file.slice(byte - w, byte + w).arrayBuffer()` of ~3-6 KB, an async
  disk read that Chrome serves from page cache after the peaks pass, then
  the same loop. Neither needs a Worker. Search should move toward the
  nearest crossing in both directions and prefer the direction that keeps
  the Region inside the user's Anchors; return the frame, not a time.

## Recommended module boundary

One module, `source/`, owns everything that knows what bytes mean. It
imports nothing from React or wavesurfer, is testable in Node against fixture
files, and is the only place that knows about RIFF, RF64, FFmpeg quirks, or
the float-to-Int16 rule. The UI owns Regions, modes, and the waveform view,
and speaks to `source/` only in frames.

```ts
// source/types.ts
export type SampleFormat =
  | { kind: 'pcm'; bits: 8 | 16 | 24 | 32; validBits: number }
  | { kind: 'float'; bits: 32 | 64 }

export interface SourceInfo {
  name: string              // basename without extension, seeds Chop names
  sampleRate: number
  channels: number
  frames: number            // total sample-frames
  duration: number          // frames / sampleRate, seconds
  origin: 'wav' | 'decoded' // wav = byte-exact passthrough; decoded = 16-bit PCM export
  format: SampleFormat      // for wav: the file's format; for decoded: { kind:'pcm', bits:16 }
  truncated: boolean        // wav data chunk ran past EOF; we used what was there
}

export interface FrameRange { start: number; end: number } // end exclusive

export interface PeaksLevel {
  framesPerBucket: number
  min: Int16Array[]         // per channel
  max: Int16Array[]         // per channel
}

export interface Source {
  readonly info: SourceInfo
  /** For the waveform. Max magnitude per bucket in 0..1, one Float32Array per channel,
   *  bucketed to `buckets` entries over `range` (default: whole Source). */
  peaks(buckets: number, range?: FrameRange): Promise<Float32Array[]>
  /** Raw frames for a detail view or zero-crossing search. Small windows only. */
  window(range: FrameRange): Promise<Int16Array[]>   // per channel, deinterleaved
  /** A Chop: a WAV Blob for `range`. wav origin: byte-exact; decoded: 16-bit PCM. */
  slice(range: FrameRange): Promise<Blob>
  /** Playable media for the <audio> element: the original File. */
  media(): Blob
  /** Release the Int16 buffer / worker. */
  dispose(): void
}

/** Sniffs RIFF/RF64; falls back to decodeAudioData at the container's sample rate. */
export function openSource(file: File, opts?: { onProgress?: (p: number) => void }): Promise<Source>
```

Why this shape:

- `peaks(buckets, range)` is what wavesurfer needs (`peaks`, plus
  `info.duration`) and also what a detail strip needs; the caller never
  sees the pyramid.
- `window(range)` is the sole path to raw samples, so zero-crossing (ticket
  05) and any future sample-level drawing sit on one small, testable call
  regardless of origin.
- `slice(range)` returns a `Blob`, so `E` export is `URL.createObjectURL`
  plus a click, and batch export (ticket 04) hands Blobs to JSZip without
  knowing whether they are file-backed or Int16-backed.
- `media()` keeps ticket 08 free to use the `<audio>` element on the
  original bytes.
- Everything is in frames; the single seconds-to-frames conversion lives in
  the UI layer next to wavesurfer.

Internals (two implementations behind the interface): `WavSource`
(chunk walker, header writer, `File.slice`, peaks Worker) and
`DecodedSource` (rate sniff, `OfflineAudioContext` decode, chunked
Int16 + pyramid pass, in-memory slice writing a 16-bit PCM header).
`openSource` picks by sniffing the first 12 bytes (`RIFF`/`RF64` + `WAVE`),
not by extension or MIME.

## Open points handed to other tickets

- Ticket 03 / 09: wavesurfer zoom is capped by Blink at ~9,300 px/s for 60
  minutes; sample-level views need a detail strip fed by
  `Source.window`/`Source.peaks(range)`.
- Ticket 04: whether JSZip buffers file-backed Blobs during
  `generateAsync`; if so, batch export memory equals total Chop bytes.
- Ticket 05: zero-crossing rules; cost is settled above.
- Ticket 08: play decoded Sources from the original Blob so the Int16
  buffer stays export-only.
- Map "Not yet specified": mono downmix at load is unnecessary for the
  60-minute case; multichannel decoded Sources fit the same interface
  (channels > 2 just means more arrays) but the Int16 buffer scales
  linearly.

[mcgill]: https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
[waveformatex]: https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex
[wfext]: https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatextensible
[rf64]: https://tech.ebu.ch/docs/tech/tech3306v1_1.pdf
[fileapi]: https://w3c.github.io/FileAPI/#slice-blob
[blobitem]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/storage/browser/blob/blob_data_item.h
[wa-decode]: https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata
[mdn-decode]: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData
[mdn-createbuffer]: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createBuffer
[chromestatus]: https://chromestatus.com/feature/5539919174828032
[bac]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/base_audio_context.cc
[audiobus]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/audio/audio_bus.cc
[contentdec]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/renderer/media/audio_decoder.cc
[afr]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/filters/audio_file_reader.cc
[limits]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/limits.h
[audiobuffer]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/webaudio/audio_buffer.cc
[audioutil]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/audio/audio_utilities.cc
[layoutunit]: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/geometry/layout_unit.h
[v8ab]: https://chromium.googlesource.com/v8/v8/+/refs/heads/main/include/v8-array-buffer.h
[v8ta]: https://chromium.googlesource.com/v8/v8/+/refs/heads/main/include/v8-typed-array.h
[v8int]: https://chromium.googlesource.com/v8/v8/+/refs/heads/main/include/v8-internal.h
[crbug176902]: https://chromium-bugs.chromium.narkive.com/1nhu9ra1/issue-176902-in-chromium-web-audio-api-crashes-tab-when-decodeaudiodata-is-called-with-a-large
[crbug400023]: https://bugs.chromium.org/p/chromium/issues/detail?id=400023
[ws-main]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.0/src/wavesurfer.ts
[ws-decoder]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.0/src/decoder.ts
[ws-renderer]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.0/src/renderer.ts
[ws-utils]: https://github.com/katspaugh/wavesurfer.js/blob/7.12.0/src/renderer-utils.ts
