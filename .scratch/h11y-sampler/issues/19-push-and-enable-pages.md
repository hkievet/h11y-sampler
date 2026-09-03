# Push to GitHub and enable Pages

Type: task
Status: open
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
