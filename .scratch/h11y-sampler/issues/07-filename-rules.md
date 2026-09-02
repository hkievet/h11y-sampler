# Filename sanitization and collision rules

Type: grilling
Status: resolved
Blocked by:

## Question

The name IS the filename. Confirm or amend the proposed rules: NFC
normalize and keep Unicode; replace `/ \ : * ? " < > |` and control
characters with `_`; collapse whitespace; trim leading/trailing spaces and
dots; guard Windows reserved names; cap at 120 characters; append `.wav`
unless present; empty name falls back to the default `<basename>-<index>`;
collisions compared case-insensitively in start order get ` (2)`, ` (3)`
and a visible warning before export; never overwrite silently inside the
zip. Also decide: does the `E` single export to Downloads apply the same
rules, and is the sanitized preview shown live next to the name field?

## Answer

Grilled 2026-09-02; all four recommendations adopted.

- **Sanitization**, applied only when a name becomes a filename, never to
  the name shown in the Region list: NFC-normalize and keep Unicode;
  replace `/ \ : * ? " < > |` and control characters with `_`; collapse
  runs of whitespace to one space; trim leading and trailing spaces and
  dots; append `_` to Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`,
  `COM1`-`COM9`, `LPT1`-`LPT9`, case-insensitive); cap at 120 characters
  before the extension; append `.wav` unless already present
  (case-insensitive); an empty result falls back to the default
  `<basename>-<index>`. Case is preserved. The rules also satisfy the
  Chrome folder-write API's name restrictions.
- **Collisions** are compared case-insensitively after sanitization, in
  start-time order, with defaults taking part. Second and later
  duplicates get ` (2)`, ` (3)`. A warning badge on the Region list shows
  affected Regions before export. Export never blocks and never
  overwrites silently.
- **Prompt preview:** when the sanitized filename differs from the typed
  name, show it live under the field in the save prompt.
- **Parity:** one sanitizer and one collision pass feed all three sinks:
  zip, folder write, and single `E` download. For `E`, an existing file
  in Downloads is left to Chrome's own counter.
