# astro-better-generate-screenshots

CLI that generates the screenshot PNGs consumed by astro-better-declarative-screenshots.

## Install

```sh
npm install astro-better-generate-screenshots
```

## What it does

- Starts Docker and captures pages with Playwright WebKit
- Injects highlights and composites window chrome, with the same address bar text as the `Screenshot` component
- Captures light and dark versions of each page with `colorScheme: 'both'`
- Grows full-page captures to the page height, up to a cap you set
- Diffs against committed PNGs to detect drift
- Optionally renders in a pinned Linux browser container, so macOS, Linux, and CI produce identical images

## Consistent rendering

Text renders differently on each OS, which makes drift checks flag screenshots that didn't really change. Set `browserContainer: true` in `screenshot.config.mjs` to capture in a container built from `mcr.microsoft.com/playwright` at your installed Playwright version, with macOS-like fonts (Inter and DejaVu Sans Mono). The container starts and stops with each run, and pages at `localhost` URLs load through the host. Docker is the only requirement; you don't need a local browser install. Pass `{ image }` to use your own Playwright-based image instead.

Every page is captured with smooth scrolling turned off. On a page that sets `scroll-behavior: smooth`, a scroll would still be moving when the crop or highlight is measured, so the image would come out offset from what you asked for.

## Documentation

Full documentation, including configuration and examples, is at
[https://better-static-sites.github.io/content/declarative-screenshots](https://better-static-sites.github.io/content/declarative-screenshots).

This package is published from the [Better Static Sites monorepo](https://github.com/better-static-sites/better-static-sites.github.io); the directory it lives in has a combined README covering it and its sibling package.
