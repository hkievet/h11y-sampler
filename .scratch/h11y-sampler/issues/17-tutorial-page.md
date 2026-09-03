# Tutorial page and keymap reference

Type: task
Status: resolved
Blocked by:

## Question

Rebuild the prototype's walkthrough tabs in the Shell: the six
walkthroughs as numbered steps with "do it for me" buttons that replay the
same key events through the real listener (with a hold variant for
Space), plus the keymap reference for the three modes. Reachable by a key
or link from the main page and from the drop zone before any Source is
loaded. Leaves the app runnable.

## Answer

Done 2026-09-03, one commit.

- `src/tutorial/walkthroughs.ts`: the six walkthroughs on the final keymap
  (mark and name, export one, loop a hit, overlap and batch export,
  edit/rename/delete/undo, Tab with no regions), the keymap reference for
  every mode, and `replay(spec)` which dispatches real `KeyboardEvent`s
  on `window` so the buttons go through the same listener as the keys
  (`:hold` keeps Space down for 900 ms).
- `src/tutorial/Tutorial.tsx`: tabs per walkthrough plus Keymap, numbered
  steps with "Do it for me" buttons that mark done, a close button.
  Toggled with `?` from any mode outside the prompt; the status bar
  advertises it.
- `src/source/demo.ts`: the prototype's 30-second signal as a WAV File
  (bass tone, drum hits, tremolo tone). The drop zone offers "try the
  demo recording"; opening it shows the tutorial automatically, so the
  tutorial works before any file is dropped.

56 tests green; unverified in a browser this session.
