# Write the spec

Type: task
Status: resolved
Blocked by:

## Question

HITL: the `to-spec` skill is user-invoked only
(`/mattpocock-skills:to-spec`), synthesizes from the conversation with no
interview, and checks the proposed test seams with the user before
publishing. Run it in a session that has this map loaded.

Turn the map's decisions into one spec the build tickets can be sliced
from. Inputs: `map.md` (Decisions so far, Out of scope), `requirements.md`
(the final keymap and settled requirements), `/CONTEXT.md` (vocabulary),
the four research docs in `research/` (Source and Transport interfaces,
wavesurfer plugin-plus-overlay recommendation, Chrome shortcut findings),
and the resolved tickets for detail. Output: `.scratch/h11y-sampler/spec.md`
in the local tracker's spec slot, written in the project's vocabulary,
with the keymap tables verbatim from `requirements.md` and the module
seams named. Nothing new is decided here; if a gap appears, list it under
an "Open" heading rather than inventing an answer.

## Answer

Written via `/mattpocock-skills:to-spec` on 2026-09-02: [spec.md](../spec.md),
labelled `ready-for-agent`. Test seams confirmed with the user: Seam A,
Playwright end to end (drop a fixture WAV, replay keys, assert the zip's
names and bytes); Seam B, Vitest on the pure core (state machine and
keymap, filename rules, WAV parse and slice). No unit tests on React,
wavesurfer glue, Transport, or IndexedDB. The spec lists no open items.
