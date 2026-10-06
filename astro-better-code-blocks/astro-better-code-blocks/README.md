# astro-better-code-blocks

Remark/rehype plugins, matching [Sätteri](https://satteri.bruits.org/) plugins (`astro-better-code-blocks/satteri`), and a copy-code web component for enhanced code blocks in Astro.

## Install

```sh
npm install astro-better-code-blocks
```

## What it does

- Line highlights with `{n,m-p}` syntax
- Collapsible line ranges with `[n-p]` syntax
- Diff overlay on any language with the `diff` keyword
- File name tabs with `title="..."` syntax
- A copy button that works correctly with all of the above
- Shell-session prompts added per command (not on continuation lines); copying a shell session gives only the commands, without prompts or output

## Documentation

Full documentation, including configuration and examples, is at
[https://better-static-sites.github.io/build-tools/code-blocks](https://better-static-sites.github.io/build-tools/code-blocks).

This package is published from the [Better Static Sites monorepo](https://github.com/better-static-sites/better-static-sites.github.io); the directory it lives in has a combined README covering it and its sibling package.
