# h11y-sampler

A keyboard-first, client-side tool for hunting samples in long recordings: drop a file, mark regions, name them, leave with a zip of WAV chops.

## Language

**Source**:
The single audio file dropped onto the page for a session. Its basename seeds default chop names.
_Avoid_: Track, upload, input file

**Region**:
A start and end within the Source, plus a name. Regions may overlap.
_Avoid_: Selection, slice, marker, clip

**Chop**:
The WAV file exported from one Region. Its filename is the Region's name, sanitized.
_Avoid_: Clip, sample, export, output file

**Playhead**:
The single current time in the Source. Every keyboard action that needs a time uses it.
_Avoid_: Cursor, position

**Playhead mode**:
The default mode. Keys move the Playhead and start or stop playback from it.
_Avoid_: Normal mode, navigate mode

**Insert Region mode**:
A Region is being drawn or redrawn. Keys move the active Anchor; saving names the Region and returns to Playhead mode.
_Avoid_: Visual mode, edit mode

**Region Select mode**:
One Region is the Active Region and keys act on it: edit, export, preview, or mark it Selected.
_Avoid_: List mode

**Anchor**:
One of the two boundaries of the Region being drawn in Insert Region mode. Exactly one Anchor is active and moves like the Playhead.
_Avoid_: Handle, edge, boundary, in-point, out-point

**Active Region**:
The single Region that Region Select mode keys act on.
_Avoid_: Current region, highlighted region, focused region

**Selected Regions**:
The set of Regions marked for batch export. Independent of which Region is active.
_Avoid_: Checked regions, marked regions

**Return point**:
Where the Playhead sits when playback starts, and where it snaps back when playback stops.
_Avoid_: Original position, play anchor
