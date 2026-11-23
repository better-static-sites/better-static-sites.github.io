# Better Static Sites

A standard library of common tools and components you might need to build a nice static site.

Does this suite contain the best tools around? I can't answer that question. But they're certainly _better_ than something.

## This repo

This repo holds both the `astro-better-*` packages and the documentation site for them.
All library packages live under `lib/`, each in its own subdirectory named after the
corresponding docs page (e.g. `lib/mermaid/`, `lib/refs/`). The docs site at the root
is built with Astro using the packages it documents.

Most `lib/` subdirectories contain one package, but some hold more than one — when a
basic package is paired with an advanced one (e.g. `lib/code-blocks/` contains both
`astro-better-code-blocks` and `astro-better-code-snippet-extractor`).

## Local development

To install dependencies (including those published from the top-level `astro-better-*` folders):

```shell-session
npm install
```

To run an Astro dev server:

```shell-session
npm run dev
```

To work against your local changes to a package instead of the published version, point the
dependency at the directory (`"astro-better-refs": "file:./lib/refs"`) or use
`npm link`. But don't commit the local reference!

## Build

```shell-session
npm run build
```

Output goes to `dist/`. The `astro-better-gen-markdown-pages` integration also writes `.md`
companion files and `dist/llms.txt` at build time.

## Screenshots

Screenshots are generated with Playwright via a separate npm install in `screenshots/`
to keep browser binaries out of the main `node_modules`.

### One-time setup

```shell-session
cd screenshots
npm install
npx playwright install webkit --with-deps
```

### Generate Screenshots

Run from the repo root to first build the site, then start the Docker
container defined in `screenshots/docker-compose.yml`, then capture every `<Screenshot>`
declared in `src/`, and write PNGs to `public/img/screenshots/`:

```shell-session
npm run screenshots
```

Commit the generated PNGs. Regular docs builds read them from disk, no Playwright
or Docker involved.

### Checking for drift

`scripts/refresh-screenshots.sh` regenerates every screenshot and compares it to the
committed version pixel by pixel, so PNG encoding noise or a stray antialiased pixel does
not read as a real change. Anything at least 98% identical and the same size is reverted to
the committed file, leaving only meaningful changes in the working tree.

```shell-session
scripts/refresh-screenshots.sh                   # regenerate and compare
scripts/refresh-screenshots.sh --compare-only    # compare what is already on disk
scripts/refresh-screenshots.sh --threshold 0.005 # stricter tolerance
```

It exits 0 when nothing meaningful changed and 2 when there is something to review, and
writes a diff image per failing comparison to `.screenshot-diffs/`. To compare two
directories directly, call `scripts/compare-screenshots.mjs --help`.

A GitHub Action (`.github/workflows/update-screenshots.yml`) runs the script every Monday
and opens a PR only when a screenshot changes beyond the tolerance.

## Releasing

Two jobs run on merge to `main`. Both are thin wrappers around a script in `scripts/`, so
anything they do can be run by hand if Actions is down or out of credits.

### Secrets

| Secret | Used by | Needs |
|---|---|---|
| `MIRROR_REPO_TOKEN` | `mirror-packages.yml` | GitHub token with `contents: write` on the sixteen `nathan-contino/*` target repos |

### Publishing to npm

`.github/workflows/publish-npm.yml` runs `scripts/publish-packages.mjs`, to publish packages.

### Mirroring to the standalone repos

`.github/workflows/mirror-packages.yml` runs `scripts/mirror-packages.mjs` to publish to the original library repos.

## Deployment

The site deploys to GitHub Pages automatically on every push to `main` via
`.github/workflows/deploy.yml`.
