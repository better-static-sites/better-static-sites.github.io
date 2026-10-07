# astro-better-code-snippet-extractor

Astro component and integration for loading Bluehawk-annotated code snippets and local source files.

## Install

```sh
npm install astro-better-code-snippet-extractor
```

## What it does

- Runs `bluehawk snip` and `bluehawk copy` at build time and on dev server start, one source directory per CPU in parallel
- Skips re-running when the source directory has not changed
- `<ExtractedCode>` component for snippets and whole source files, with Bluehawk markup removed

## Documentation

Full documentation, including configuration and examples, is at
[https://better-static-sites.github.io/build-tools/code-snippet-extractor](https://better-static-sites.github.io/build-tools/code-snippet-extractor).

This package is published from the [Better Static Sites monorepo](https://github.com/better-static-sites/better-static-sites.github.io); the directory it lives in has a combined README covering it and its sibling package.
