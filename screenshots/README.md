# Screenshots

This directory contains the screenshot generation setup for bss-docs.
It is intentionally separate from the main site's `node_modules` to keep
Playwright's browser binaries out of the regular build.

## Prerequisites

Screenshot generation runs the site inside a Docker container. You need one of:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [OrbStack](https://orbstack.dev/) (macOS)
- Any other Docker-compatible container runtime

Make sure the runtime is running before generating screenshots.

## One-time setup

```sh
cd screenshots
npm install
npx playwright install webkit --with-deps
```

## Generating screenshots

From the repo root:

```sh
npm run screenshots
```

This builds the site first, then starts the Docker container (which serves `dist/`),
captures every `<Screenshot>` declared in `src/`, and writes PNGs to `public/img/screenshots/`.

The CLI starts the Docker container defined in `docker-compose.yml`,
waits for the health check, captures every `<Screenshot>` found in
`src/`, and writes PNGs to `public/img/screenshots/`.

Commit the generated PNGs. Subsequent builds read them from disk --
no Playwright or Docker involved.

## Checking for drift

`check-screenshots` does not rebuild -- it checks the current `dist/` against committed references.
Run `npm run screenshots` first if `dist/` is stale.

```sh
npm run check-screenshots -- --threshold 0.002 --diff-dir .screenshot-diffs
```

Exits non-zero if any screenshot differs from the committed reference
beyond the threshold. Used by the `update-screenshots` GitHub Action.

## Regenerating a subset

Pass `--filter` to limit which screenshots run:

```sh
npm run screenshots -- --filter tables
```

Matches against the screenshot URL and `id`.
