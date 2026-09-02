# Chrome-reserved shortcuts on macOS

Type: research
Status: resolved
Blocked by:

## Question

Which modifier-key combinations can a web page intercept in Chrome on
macOS, and which are reserved by Chrome or the OS regardless of
`preventDefault`? The keymap needs three scrub speeds on `[` / `]`
(plain, Shift, and one more modifier) plus a batch-export chord and
undo/redo. Cmd+H, Cmd+Shift+H, Cmd+[ / ], and Cmd+Shift+[ / ] are believed
reserved. Deliver: a table of candidate chords (Option, Option+Shift, Ctrl,
Cmd, Cmd+Shift with brackets, H/L, E, Z, Enter, Space) marked interceptable
or reserved, with sources, and note whether `event.code` matching avoids
Option-key dead characters.

## Answer

Findings: [research/chrome-reserved-shortcuts.md](../research/chrome-reserved-shortcuts.md)
(sources: Chromium `IsReservedCommandOrKey` and the Mac command dispatcher,
Chrome shortcut help, Apple shortcut list, MDN, UI Events, plus a local
`UCKeyTranslate` check of this Mac's US layout).

- **Coarse scrub = Option+[ / Option+]**, matched on
  `event.code === "BracketLeft" | "BracketRight"` with `altKey` and no
  `metaKey`/`ctrlKey`. Unbound in Chrome and macOS defaults. Ctrl+[ ] is
  the interceptable fallback.
- **Match on `event.code`, never `event.key`.** On macOS Chrome treats
  Option as a glyph modifier: Option+[ reports `key: "“"`, Option+] `"‘"`,
  shifted variants `"”"` / `"’"`. None are dead keys (unlike
  Option+E/U/I/N/`), so `code` matching is clean.
- **Export = Cmd+E** (interceptable; only displaces "Use Selection for
  Find"). Cmd+Enter is the equally safe alternative. Avoid Ctrl+Enter
  (macOS 15 rewrites it to a ContextMenu key outside inputs) and Ctrl+E as
  primary (Emacs end-of-line inside inputs).
- **Truly reserved, page never sees them:** Cmd+Shift+[ / ] (tab switch),
  Cmd+W, Cmd+Shift+W, Cmd+T, Cmd+N, Cmd+Shift+N, Cmd+Shift+T, Cmd+Q,
  Ctrl+Tab, Cmd+Option+arrows, and macOS symbolic hotkeys (Cmd+Space,
  Cmd+`, screenshots, Spaces, any user-defined System Settings shortcut).
- Cmd+H, Cmd+Shift+H and Cmd+[ / ] are technically interceptable, contrary
  to the ticket's belief, but still bad choices: they steal well-known
  user shortcuts.
- **Undo/redo:** `u` and Ctrl+R are interceptable; also bind Cmd+Z /
  Cmd+Shift+Z, and let `u` be remapped or turned off (WCAG 2.1.4).
- Test with real key presses, not synthetic events: only hardware events
  go through the reserved-command path.
