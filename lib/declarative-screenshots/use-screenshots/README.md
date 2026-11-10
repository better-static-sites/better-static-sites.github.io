# astro-better-declarative-screenshots

Astro components that render committed screenshot PNGs in your docs site. No Playwright, no Docker, no heavy dependencies.

## Install

```sh
npm install astro-better-declarative-screenshots
```

## What it does

- Declare screenshots and highlights inline in MDX
- Reads committed PNG files and renders them at build time
- Shows the light or dark image that matches your site's theme
- Trims the address bar to the path, without the query string, hash, or full UUIDs, for every screenshot or one at a time
- Shows a compact address bar in place of the window frame on narrow screens
- Pairs with `astro-better-generate-screenshots`, which produces the PNGs

## Documentation

Full documentation, including configuration and examples, is at
[https://better-static-sites.github.io/content/declarative-screenshots](https://better-static-sites.github.io/content/declarative-screenshots).

This package is published from the [Better Static Sites monorepo](https://github.com/better-static-sites/better-static-sites.github.io); the directory it lives in has a combined README covering it and its sibling package.
