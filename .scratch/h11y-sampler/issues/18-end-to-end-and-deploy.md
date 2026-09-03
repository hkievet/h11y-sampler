# Seam A end-to-end tests and deploy

Type: task
Status: claimed
Blocked by:

## Question

Playwright against real Chromium: generate fixture WAVs (16-bit, 24-bit,
float, JUNK chunk), drop each, replay a key script, export, and assert
zip entry names and byte-equal data chunks; the reload restore flow; the
tutorial's buttons producing the same state as the keys; Space never
scrolling. Then a GitHub Actions workflow that runs both seams and
deploys `dist/` to GitHub Pages (or a Cloudflare Pages config), and a
README with the keymap. Leaves the app deployed.
