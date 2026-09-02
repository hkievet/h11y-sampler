# Chrome-reserved shortcuts on macOS

Resolves: `issues/01-chrome-reserved-shortcuts.md`
Date: 2026-09-02
Scope: Chrome (Chromium `main` as of this date) on macOS, US keyboard layout, page not in fullscreen, no Keyboard Lock.

## TL;DR

- Chrome on macOS lets the page see (and `preventDefault()`) almost every chord. Only a short, hard-coded list of *commands* is executed before the page ever gets the event: close tab/window, new tab/window/incognito, reopen closed tab, select next/previous tab, cycle tabs, quit. Plus whatever macOS itself registers as a "symbolic hotkey" (Cmd+Space, Cmd+Tab, Cmd+`, screenshots, Mission Control keys, and anything the user has bound in System Settings > Keyboard > Shortcuts).
- So of the chords the ticket believed reserved: **Cmd+Shift+[ / ]** really is reserved (tab switching). **Cmd+H**, **Cmd+Shift+H**, and **Cmd+[ / ]** are *not* reserved: the page gets them first and `preventDefault()` suppresses Hide / Home / Back / Forward. They are still bad choices because they steal well-known user shortcuts.
- **Recommendation:** coarse scrub = **Option+[ / Option+]** matched on `event.code === "BracketLeft" | "BracketRight"` with `altKey && !metaKey && !ctrlKey`. Export = **Cmd+E** (or Cmd+Enter as the equally safe alternative). Undo/redo: `u` / `Ctrl+R` are both interceptable; also bind Cmd+Z / Cmd+Shift+Z since they are interceptable too and match platform convention.
- **Yes, match on `event.code`.** On macOS Chrome treats Option as a glyph modifier (AltGr), so `event.key` for Option+[ is `"“"` (U+201C), Option+Shift+[ is `"”"`, Option+] is `"‘"`, Option+Shift+] is `"’"`. None of these are dead keys on the US layout (Option+E/U/I/N/` are), but `event.code` is `"BracketLeft"` / `"BracketRight"` regardless of layout, modifier, or dead-key state.

## How Chrome on macOS decides who gets a chord first

The dispatch order, from Chromium source and Apple's event guide:

1. AppKit sends a key equivalent (any keydown carrying Cmd or Ctrl; Chromium's `CommandDispatcher` also routes Option-only chords this way) to the key window's `performKeyEquivalent:` *before* the menu bar sees it. Apple: "If no object in the view hierarchy handles the key equivalent, NSApp then sends performKeyEquivalent: to the menus in the menu bar." ([Apple Event Handling Guide, "Handling Key Equivalents"](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingKeyEvents/HandlingKeyEvents.html))
2. Chrome's window forwards to `CommandDispatcher`, which first calls `ChromeCommandDispatcherDelegate prePerformKeyEquivalent:`. That resolves the event to a Chrome command id (`CommandForKeyEvent`) and asks the browser side to execute it with `is_before_first_responder = true`. ([chrome_command_dispatcher_delegate.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm), [command_dispatcher.mm](https://github.com/chromium/chromium/blob/main/ui/base/cocoa/command_dispatcher.mm))
3. `BrowserNativeWidgetMac::WillExecuteCommand` refuses to run anything before the first responder unless `IsReservedCommandOrKey(command)` is true: "If a command is reserved, then we also have it bypass the main menu." ([browser_native_widget_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/views/frame/browser_native_widget_mac.mm))
4. `BrowserCommandController::IsReservedCommandOrKey` returns true only for `IDC_CLOSE_TAB, IDC_CLOSE_WINDOW, IDC_NEW_INCOGNITO_WINDOW, IDC_NEW_ISOLATED_WINDOW, IDC_NEW_TAB, IDC_NEW_WINDOW, IDC_RESTORE_TAB, IDC_SELECT_NEXT_TAB, IDC_SELECT_PREVIOUS_TAB, IDC_CYCLE_TO_NEXT_TAB, IDC_CYCLE_TO_PREV_TAB, IDC_EXIT` (plus fullscreen-exit special cases; nothing is reserved for `TYPE_APP` windows, i.e. installed PWAs). ([browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc))
5. If not reserved, the event goes down the view hierarchy to `RenderWidgetHostViewCocoa performKeyEquivalent:`, which first checks `EventIsReservedBySystem` (macOS symbolic hotkeys) and otherwise forwards the event asynchronously to the renderer and returns YES. ([render_widget_host_view_cocoa.mm](https://github.com/chromium/chromium/blob/main/content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm))
6. Only if the page does **not** call `preventDefault()` is the event redispatched, landing in `postPerformKeyEquivalent:`, which passes menu-bar key equivalents (Back, Forward, Hide, Home, Undo, Use Selection for Find, ...) to the main menu. "postPerformKeyEquivalent: is only called on events that are not reserved." ([chrome_command_dispatcher_delegate.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm))

Menu items that are not Chrome commands (`hide:`, `undo:`, `copyToFindPboard:` ...) "can't be reserved in `BrowserCommandController::IsReservedCommandOrKey()` anyhow" ([global_keyboard_shortcuts_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm)), so they are always interceptable.

The macOS-level reserved set (`SystemHotkeyMap`) is read from `com.apple.symbolichotkeys.plist`, seeded with Cmd+` (window cycling) and only ever contains chords with at least one of Ctrl/Cmd/Option. ([system_hotkey_map.mm](https://github.com/chromium/chromium/blob/main/content/browser/cocoa/system_hotkey_map.mm)) By default this covers Spotlight (Cmd+Space), input-source switching (Ctrl+Space / Cmd+Option+Space), screenshots (Cmd+Shift+3/4/5), Mission Control / Spaces (Ctrl+arrows, Ctrl+1..), etc. ([Apple: Mac keyboard shortcuts](https://support.apple.com/en-us/102650)). None of the default entries use `[`, `]`, `E`, `Z`, `R`, `H`, Enter, Space, or Tab, but a user can add any chord there and it would then bypass the page.

Two escape hatches worth knowing: the Keyboard Lock API lets a fullscreen page capture even reserved chords (`isKeyLocked:` in [command_dispatcher.h](https://github.com/chromium/chromium/blob/main/ui/base/cocoa/command_dispatcher.h)), and installed PWA windows (`TYPE_APP`) reserve nothing. Neither should be relied on for a normal tab.

The rationale for browsers refusing to hand over these keys: "If a web page calls preventDefault() for all keydown events, users who can use only keyboard cannot switch active tabs, move focus nor quit from web browser" (Masayuki Nakano, UI Events issue #65, listing Chrome/Safari on Mac as withholding Cmd+N, Cmd+W, Cmd+Q, Cmd+T, Ctrl+Tab, Ctrl+Shift+Tab; [w3.org archive](https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html)).

## Candidate chords

Legend: **interceptable** = page receives `keydown` first and `preventDefault()` suppresses the browser/OS action; **reserved** = executed before the page sees it, `preventDefault()` has no effect; **risky** = technically interceptable but overrides something users expect, or behaves differently across focus/OS versions.

| Chord | Verdict | Reason | Source |
|---|---|---|---|
| Option+[ / Option+] | **interceptable** | No Chrome menu or hidden accelerator uses Option+bracket; no default macOS symbolic hotkey either. `event.key` is `“` / `‘` (glyph modifier), so match `event.code`. | [accelerators_cocoa.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm), [global_keyboard_shortcuts_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm), [keyboard_code_conversion_mac.mm](https://github.com/chromium/chromium/blob/main/ui/events/keycodes/keyboard_code_conversion_mac.mm) |
| Option+Shift+[ / ] | **interceptable** | Same as above; `event.key` is `”` / `’`. Not a dead key on US layout (verified with `UCKeyTranslate`, see appendix). | [uievents-key: glyph modifiers](https://w3c.github.io/uievents-key/#selecting-key-attribute-values), appendix |
| Ctrl+[ / Ctrl+] | **interceptable** | No Chrome binding on macOS. AppKit sends Ctrl chords to `performKeyEquivalent:` first, which routes to the renderer. Ctrl+[ is Esc in terminals, so some users have that muscle memory. | [Apple Event Handling Guide](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingKeyEvents/HandlingKeyEvents.html), [accelerators_cocoa.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm) |
| Cmd+[ / Cmd+] | **risky** (interceptable) | Maps to `IDC_BACK` / `IDC_FORWARD` via the Edit/History menu; those ids are not in the reserved list, so `preventDefault()` suppresses navigation. But it is the documented Back/Forward shortcut and a missed handler navigates the user away from their work. | [browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc), [Chrome shortcuts (Mac)](https://support.google.com/chrome/answer/157179) |
| Cmd+Shift+[ / Cmd+Shift+] | **reserved** | Hidden accelerator to `IDC_SELECT_PREVIOUS_TAB` / `IDC_SELECT_NEXT_TAB`, both in the reserved list; executed in `prePerformKeyEquivalent:` before the renderer. | [global_keyboard_shortcuts_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm), [browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc) |
| Cmd+E | **interceptable** | Edit > Find > "Use Selection for Find" (`copyToFindPboard:` selector, not a Chrome command id, so cannot be reserved). Low-value shortcut in a non-text app; fine to take. | [main_menu_builder.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/main_menu_builder.mm), [global_keyboard_shortcuts_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm) |
| Ctrl+E | **interceptable**, mildly risky | No Chrome binding on macOS (Ctrl+E = focus search only on Windows/Linux, and that is not reserved either). In editable fields it is the Cocoa/Emacs "end of line" binding, so scope it to non-input focus. | [accelerator_table.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/accelerator_table.cc), [Apple shortcuts: Control-E](https://support.apple.com/en-us/102650) |
| Cmd+Z / Cmd+Shift+Z | **interceptable** | Edit > Undo/Redo use `undo:` / `redo:` selectors (not reserved); `IDC_CONTENT_CONTEXT_UNDO` is only the context-menu variant. Page-level undo is the expected use, so overriding is correct, not risky. | [accelerators_cocoa.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm), [browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc) |
| Ctrl+R | **interceptable** | Unbound in Chrome on macOS (reload is Cmd+R). On Windows/Linux/ChromeOS Ctrl+R is `IDC_RELOAD`, which is also not reserved (only the ChromeOS top-row Refresh *key* is), so `preventDefault()` works there too. | [accelerator_table.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/accelerator_table.cc), [browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc) |
| Cmd+Enter | **interceptable** | Chrome only binds it in the address bar ("open in new background tab"). In page content the only default is opening a *focused link* in a new tab, a renderer default action that `preventDefault()` cancels. | [Chrome shortcuts (Mac)](https://support.google.com/chrome/answer/157179), [UI Events: keydown cancelable](https://www.w3.org/TR/uievents/#event-type-keydown) |
| Ctrl+Enter | **risky** (interceptable) | On macOS 15+, AppKit routes Ctrl+Return to `contextMenuKeyDown:`; Chrome rewrites it into a ContextMenu key event when focus is not in a text input, so the page sees `key: "ContextMenu"` plus a `contextmenu` event instead of a plain Enter. Behaviour differs by OS version and focus. | [render_widget_host_view_cocoa.mm `contextMenuKeyDown:`](https://github.com/chromium/chromium/blob/main/content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm) |
| Shift+Space | **interceptable** | Documented Chrome page shortcut "scroll up a screen"; a renderer default action of a cancelable `keydown`. Only fires when focus is not in a text input. | [Chrome shortcuts (Mac)](https://support.google.com/chrome/answer/157179), [UI Events](https://www.w3.org/TR/uievents/#event-type-keydown) |
| Tab | **risky** (interceptable) | Focus traversal is a cancelable `keydown` default action, but swallowing it creates a keyboard trap (WCAG 2.1.2). Only override inside a composite widget that manages its own focus, and never globally. | [UI Events: keydown default actions](https://www.w3.org/TR/uievents/#event-type-keydown), [WCAG 2.1.2 No Keyboard Trap](https://www.w3.org/TR/WCAG21/#no-keyboard-trap) |
| Cmd+H | **risky** (interceptable) | Chrome > Hide is `IDC_HIDE_APP` (Cmd+H), not in the reserved list; page sees it first. But it is a system-wide convention (Apple lists it), so users will hit it expecting to hide the app. Do not bind. | [accelerators_cocoa.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm), [Apple shortcuts: Command-H](https://support.apple.com/en-us/102650) |
| Cmd+Shift+H | **interceptable** | Chrome "Home page" (`IDC_HOME`), not reserved. Rarely used; acceptable but H/L vim-style scrub on Cmd is not worth the collision. | [accelerators_cocoa.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm), [Chrome shortcuts (Mac)](https://support.google.com/chrome/answer/157179) |
| Cmd+W, Cmd+Shift+W, Cmd+T, Cmd+N, Cmd+Shift+N, Cmd+Shift+T, Cmd+Q, Ctrl+Tab, Ctrl+Shift+Tab, Cmd+Option+Left/Right, Ctrl+PageUp/PageDown | **reserved** | All map to ids in `IsReservedCommandOrKey` (close tab/window, new tab/window/incognito, restore tab, quit, select/cycle tabs). Never dispatched to the page. | [browser_command_controller.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc), [global_keyboard_shortcuts_mac.mm](https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm) |
| Cmd+`, Cmd+Space, Cmd+Tab, Cmd+Shift+3/4/5, Ctrl+arrows (Spaces), any user-defined System Settings shortcut | **reserved (macOS)** | Matched against `com.apple.symbolichotkeys.plist` in `SystemHotkeyMap`; `RenderWidgetHostViewCocoa` returns NO without forwarding to the renderer. | [system_hotkey_map.mm](https://github.com/chromium/chromium/blob/main/content/browser/cocoa/system_hotkey_map.mm), [render_widget_host_view_cocoa.mm](https://github.com/chromium/chromium/blob/main/content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm) |

## `event.code` vs `event.key` for Option chords

- MDN: `KeyboardEvent.code` "represents a physical key on the keyboard (as opposed to the character generated by pressing the key). In other words, this property returns a value that isn't altered by keyboard layout or the state of the modifier keys." ([MDN: KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code))
- UI Events code spec: `BracketLeft` = "`[{` on a US keyboard", `BracketRight` = "`]}` on a US keyboard"; code values "are based only on the key's physical location on the keyboard and do not vary based on the user's current locale." ([W3C UI Events KeyboardEvent code Values](https://www.w3.org/TR/uievents-code/))
- UI Events key spec: glyph modifiers are "Shift, CapsLock or AltGr"; `key` is computed *with* those applied, and a dead key yields `key === "Dead"`. Chromium's macOS implementation explicitly treats Option as the AltGr glyph modifier (`kGlyphModifiers = Shift | CapsLock | Option`) and has a dedicated dead-key step ("Step pre-3 ... special handling for dead keys in macOS"). ([uievents-key](https://w3c.github.io/uievents-key/#selecting-key-attribute-values), [keyboard_code_conversion_mac.mm](https://github.com/chromium/chromium/blob/main/ui/events/keycodes/keyboard_code_conversion_mac.mm))
- Consequence: for Option+[ Chrome reports `key: "“"`, `code: "BracketLeft"`, `altKey: true`. Matching on `code` sidesteps both the typographic-quote characters and true dead keys (Option+E/U/I/N/`, which report `key: "Dead"`). It also keeps working on non-US layouts as long as the user's physical `[`/`]` keys are where the US layout has them; on layouts where they are not (e.g. German, where `[` is Option+5), show the chord in the UI using `KeyboardLayoutMap` or accept that the physical key differs.
- Do not use `event.key === "["` combined with `altKey` on macOS: it will never match.

Verified locally on this machine's "U.S." layout with Carbon `UCKeyTranslate` (the same API Chromium uses):

```
[ + none:         '[' U+005B  dead=false
[ + Shift:        '{' U+007B  dead=false
[ + Option:       '“' U+201C  dead=false
[ + Option+Shift: '”' U+201D  dead=false
] + none:         ']' U+005D  dead=false
] + Shift:        '}' U+007D  dead=false
] + Option:       '‘' U+2018  dead=false
] + Option+Shift: '’' U+2019  dead=false
e + Option:       ''          dead=true   (control: a real dead key)
```

## Recommendation

**Scrub speeds on the bracket keys**

| Speed | Chord | Match |
|---|---|---|
| fine | `[` / `]` | `code === "BracketLeft"/"BracketRight"`, no modifiers |
| medium | Shift+`[` / Shift+`]` (`{` `}`) | same `code`, `shiftKey` |
| coarse | **Option+`[` / Option+`]`** | same `code`, `altKey && !metaKey && !ctrlKey` |

Option is the right third modifier: it is the only one of Option/Ctrl/Cmd that is unbound at both the Chrome and macOS level for the bracket keys, it is the macOS convention for "bigger step" (Option+arrow moves by word), and Option+Shift+[ ] is also free if a fourth speed is ever needed. Ctrl+[ ] is the fallback (also interceptable) if Option ever conflicts with a user's custom System Settings hotkey. Do not use Cmd+[ ] (steals Back/Forward; a handler bug navigates away) and Cmd+Shift+[ ] cannot be used at all (reserved tab switching). Always check `!metaKey` in the plain/Shift handlers so Cmd+[ ] still reaches the browser.

**Batch-export chord: Cmd+E** (`code === "KeyE" && metaKey && !shiftKey && !altKey && !ctrlKey`, `preventDefault()`). It is interceptable, mnemonic, and the only thing it displaces ("Use Selection for Find") is meaningless in this app. Cmd+Enter is the equally safe alternative if an "execute"-flavoured chord is preferred, and Cmd+Shift+E is also unbound in Chrome on macOS if a two-modifier "batch" chord is wanted. Avoid Ctrl+Enter (macOS 15 context-menu key rewriting) and Ctrl+E as the primary (Emacs end-of-line inside inputs). Chrome will drop key repeats only for new tab/window commands, so debounce the export handler yourself.

**Undo/redo:** `u` and `Ctrl+R` are both interceptable on macOS (and Ctrl+R is also cancelable on Windows/Linux where it is reload). Bind them, and additionally bind Cmd+Z / Cmd+Shift+Z, which are interceptable and match what macOS users will try first. Because `u` is a single-character shortcut, WCAG 2.1.4 requires that it can be turned off or remapped, or is active only when a relevant component has focus ([WCAG 2.1.4](https://www.w3.org/TR/WCAG21/#character-key-shortcuts)).

**General rules from the source reading**

- Never rely on a Cmd chord that resolves to close/new/restore/select-tab/quit; the page will not see it.
- Test real hardware key presses in Chrome, not synthetic `KeyboardEvent`s or CDP `Input.dispatchKeyEvent`; only real events go through `performKeyEquivalent:` and the reserved-command path.
- Re-check the reserved list against `IsReservedCommandOrKey` when upgrading Chrome; it is short and hard-coded, but it does change (e.g. `IDC_NEW_ISOLATED_WINDOW`, `IDC_CYCLE_TO_*_TAB` were added).

## Appendix: local verification script

Compiled with `swiftc` and run on the machine's current layout (U.S.); output is reproduced above.

```swift
import Carbon
import Foundation
let src = TISCopyCurrentKeyboardLayoutInputSource().takeRetainedValue()
let dataRef = Unmanaged<CFData>.fromOpaque(TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)).takeUnretainedValue()
let data = dataRef as Data
func translate(_ key: UInt16, _ mods: UInt32) -> (String, Bool) {
  var dead: UInt32 = 0; var len = 0; var buf = [UniChar](repeating: 0, count: 8)
  data.withUnsafeBytes { raw in
    let layout = raw.bindMemory(to: UCKeyboardLayout.self).baseAddress!
    UCKeyTranslate(layout, key, UInt16(kUCKeyActionDown), (mods >> 8) & 0xFF,
                   UInt32(LMGetKbdType()), 0, &dead, 8, &len, &buf)
  }
  return (String(utf16CodeUnits: buf, count: len), dead != 0)
}
for (k, name) in [(UInt16(0x21), "["), (0x1E, "]"), (0x0E, "e")] {
  for (m, mn) in [(UInt32(0), "none"), (UInt32(shiftKey), "Shift"),
                  (UInt32(optionKey), "Option"), (UInt32(optionKey|shiftKey), "Option+Shift")] {
    let (s, d) = translate(k, m); print("\(name) + \(mn): '\(s)' dead=\(d)")
  }
}
```

## Sources

- Chromium `chrome/browser/ui/browser_command_controller.cc` (`IsReservedCommandOrKey`): https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc
- Chromium `chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm`: https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm
- Chromium `chrome/browser/global_keyboard_shortcuts_mac.mm` (hidden accelerators, Cmd+Shift+[ ]): https://github.com/chromium/chromium/blob/main/chrome/browser/global_keyboard_shortcuts_mac.mm
- Chromium `chrome/browser/ui/cocoa/accelerators_cocoa.mm` (menu key equivalents: Cmd+[ ], Cmd+H, Cmd+Shift+H, Cmd+Z ...): https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/accelerators_cocoa.mm
- Chromium `chrome/browser/ui/cocoa/main_menu_builder.mm` (Cmd+E = `copyToFindPboard:`): https://github.com/chromium/chromium/blob/main/chrome/browser/ui/cocoa/main_menu_builder.mm
- Chromium `chrome/browser/ui/views/frame/browser_native_widget_mac.mm` (`WillExecuteCommand`): https://github.com/chromium/chromium/blob/main/chrome/browser/ui/views/frame/browser_native_widget_mac.mm
- Chromium `ui/base/cocoa/command_dispatcher.{h,mm}`: https://github.com/chromium/chromium/blob/main/ui/base/cocoa/command_dispatcher.mm
- Chromium `content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm` (`performKeyEquivalent:`, `contextMenuKeyDown:`): https://github.com/chromium/chromium/blob/main/content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm
- Chromium `content/browser/cocoa/system_hotkey_map.mm`: https://github.com/chromium/chromium/blob/main/content/browser/cocoa/system_hotkey_map.mm
- Chromium `ui/events/keycodes/keyboard_code_conversion_mac.mm` (Option as glyph modifier, dead keys): https://github.com/chromium/chromium/blob/main/ui/events/keycodes/keyboard_code_conversion_mac.mm
- Chromium `chrome/browser/ui/accelerator_table.cc` (non-Mac bindings for Ctrl+R / Ctrl+E): https://github.com/chromium/chromium/blob/main/chrome/browser/ui/accelerator_table.cc
- Google Chrome Help, "Chrome keyboard shortcuts" (Mac): https://support.google.com/chrome/answer/157179
- Apple, "Mac keyboard shortcuts": https://support.apple.com/en-us/102650
- Apple, Cocoa Event Handling Guide, "Handling Key Equivalents": https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingKeyEvents/HandlingKeyEvents.html
- MDN, `KeyboardEvent.code`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
- MDN, `KeyboardEvent.key`: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
- W3C UI Events KeyboardEvent code Values: https://www.w3.org/TR/uievents-code/
- W3C UI Events KeyboardEvent key Values, "Selecting key attribute values": https://w3c.github.io/uievents-key/#selecting-key-attribute-values
- W3C UI Events, `keydown` (cancelable, default actions): https://www.w3.org/TR/uievents/#event-type-keydown
- Masayuki Nakano on UI Events issue #65 (browsers withholding reserved chords): https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html
- WCAG 2.1 SC 2.1.2 No Keyboard Trap / 2.1.4 Character Key Shortcuts: https://www.w3.org/TR/WCAG21/#no-keyboard-trap
