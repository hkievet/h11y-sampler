# Region Select mode: ordering, mutations, Selected Regions, batch export

Type: grilling
Status: resolved
Blocked by:

## Question

Settle the Region Select mode edges left open in charting:

- `h` / `l` cycle order: insertion order or start-time order? (Regions
  overlap, so start order is a real choice.)
- Keys for: delete Active Region, rename without redrawing bounds, undo,
  redo, and Esc back to Playhead mode. Proposed `x`, `r`, `u`, `Ctrl+R`.
- Selected Regions: `Shift+Space` toggles or adds only? What clears the
  set? Select all?
- Batch export chord: zip of Selected Regions, or all Regions when none
  are selected. Proposed `Cmd+E`, subject to ticket 01.
- Zip filename. Proposed `<source-basename>-chops.zip`.
- Does `E` (single export to Downloads) also work from Insert Region mode
  on the draft?

## Answer

Grilled 2026-09-02; all six recommendations adopted.

- **Cycle order:** `h` / `l` walk Regions in start-time order, ties broken
  by end time. Default Chop indices follow the same order.
- **Entering Region Select:** `Tab` makes the Region nearest the Playhead
  active, preferring one that contains it.
- **Mutations:** `x` deletes the Active Region and activates the next in
  order (previous if it was last; back to Playhead mode with a toast if it
  was the only one). `r` opens the name prompt only, existing name
  highlighted. `u` undoes, `Ctrl+R` redoes, with `Cmd+Z` / `Cmd+Shift+Z`
  as aliases. `Esc` returns to Playhead mode without moving the Playhead.
- **Undo scope:** create, delete, bounds change (one step per Insert
  session), rename. Each is a single step.
- **Selected Regions:** `Shift+Space` toggles the Active Region. `A`
  selects all, `Shift+A` clears. The set survives mode switches; `Esc`
  never touches it.
- **Batch export:** `Cmd+E` zips Selected Regions, or all Regions when
  none are selected, with no prompt, then clears the set. Zip name is
  `<source-basename>-chops.zip`, fixed; the browser's ` (1)` suffix
  handles repeats.
- **`E` on a draft:** not allowed. A Chop always comes from a saved,
  named Region.
