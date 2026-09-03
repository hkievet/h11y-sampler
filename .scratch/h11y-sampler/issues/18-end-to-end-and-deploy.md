# Seam A end-to-end tests and deploy

Type: task
Status: resolved
Blocked by:

## Question

Playwright against real Chromium: generate fixture WAVs (16-bit, 24-bit,
float, JUNK chunk), drop each, replay a key script, export, and assert
zip entry names and byte-equal data chunks; the reload restore flow; the
tutorial's buttons producing the same state as the keys; Space never
scrolling. Then a GitHub Actions workflow that runs both seams and
deploys `dist/` to GitHub Pages (or a Cloudflare Pages config), and a
README with the keymap. Leaves the app deployed.

## Answer

Done 2026-09-03, three commits. `e2e/app.spec.ts`, `playwright.config.ts`,
`.github/workflows/ci.yml`, `README.md`.

- **Seam A, seven Playwright tests in real Chromium**, all green in about
  nine seconds: a 24-bit extensible WAV with a JUNK chunk dropped through
  the file input, marked with real key presses (four coarse steps, `i`,
  `I`, `s`), named one typed, one automatic, one sanitised and colliding,
  zipped with `Cmd+E`, every entry checked byte-equal to the fixture with
  the `fmt ` chunk verbatim and `regions.json` frames exact; a float WAV
  single `E` export with its `fact` chunk; truncation reported in the
  header; Space never scrolls while play, restart-on-scrub, audition, and
  hold-loop run with no page errors; Tab shake and toast; cycling leaves
  the playhead untouched; reload plus re-drop restores two regions with
  the toast; the demo recording opens the tutorial and "Do it for me"
  drives the same keys, `?` toggles, the Keymap tab renders.
- **Two real findings from the first browser run.** wavesurfer's container
  sat above the overlay and swallowed pointer events, so mouse drag never
  reached the app; fixed with stacking and `pointer-events: none` on the
  wavesurfer layer. And a region sharing bounds with an earlier one sorts
  second, so its automatic index is 01, which the test now expects.
- **CI:** GitHub Actions on push and pull request runs `tsc`, Vitest, the
  Playwright suite with Chromium, and the build; on `main` it uploads
  `dist/` and deploys to GitHub Pages. The Vite `base` is relative so the
  bundle works under a repository path.
- **README** with the keymap and the module layout.

Deployment itself needs a GitHub repository and Pages enabled: ticket 19.
