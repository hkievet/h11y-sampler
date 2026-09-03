# Push to GitHub and enable Pages

Type: task
Status: resolved
Blocked by:

## Question

HITL. The workflow is ready; only the user can create the remote and flip
the Pages switch. Checklist:

1. Create an empty GitHub repository (say `h11y-sampler`), no README.
2. `git remote add origin git@github.com:<you>/h11y-sampler.git`
3. `git push -u origin main`
4. Repository Settings, Pages, Build and deployment, Source: **GitHub
   Actions** (not "Deploy from a branch").
5. Watch the `ci` workflow in the Actions tab; the deploy job prints the
   site URL. First run takes a few minutes (Chromium download).
6. Open the URL, click "try the demo recording", press `i`.

Resolved when the URL is live and recorded here.

## Answer

Done 2026-09-03 with the user's go-ahead, via the GitHub CLI.

- Repository: https://github.com/hkievet/h11y-sampler (public).
- Pages source set to GitHub Actions via the API (`build_type: workflow`).
- First `ci` run: type-check, 56 Vitest tests, 7 Playwright tests in
  Linux Chromium, build, deploy, all green.
- **Live:** https://hkievet.github.io/h11y-sampler/

One annotation to tidy later: GitHub warns that checkout@v4, setup-node@v4
and upload-artifact@v4 target Node 20; bump to v5 when convenient.
