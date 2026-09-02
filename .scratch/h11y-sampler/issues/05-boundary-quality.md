# Boundary quality for sample-level cuts

Type: grilling
Status: resolved
Blocked by:

## Question

Sample-level precision is settled; what makes it usable by ear and
click-free on export? Options: zero-crossing snap on export (toggleable);
micro-fades of 1 to 5 ms at each end (toggleable); a boundary audition key
in Insert Region mode that plays 300 ms either side of the active Anchor;
or none. Also: does snap move the boundary the user set, or only the
exported sample, and is the snap direction inward, outward, or nearest?
Recommendation going in: snap plus audition, no fades.

## Answer

Grilled 2026-09-02. All four recommendations adopted; the user asked for
snap and audition to be felt in the prototype before they are final.

- **Zero-crossing snap:** a global toggle, persisted, shown in the status
  bar, toggled with `Z` in Playhead and Region Select modes. Applied at
  export only; stored boundaries never move. Search the mono downmix
  within 5 ms of each boundary for the nearest zero crossing and snap
  **inward**, so a Chop never contains audio outside the marks. No
  crossing found: export the boundary as set. Applies to the zip and to
  the single `E` export alike.
- **Audition key:** in Insert Region mode, `a` auditions the active
  Anchor at any time. Space previews the draft when both Anchors exist
  and auditions the active Anchor when only one does.
- **Audition is directional:** a start Anchor plays 300 ms forward from
  itself (how the Chop begins); an end Anchor plays the 300 ms leading
  into it and stops dead (how the Chop ends).
- **Micro-fades:** out of scope for this effort.
