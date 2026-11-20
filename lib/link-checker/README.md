# astro-better-link-checker

Fast intra-site broken link checker for Astro. The checker runs after `astro build` and reports every link, image, and anchor that doesn't resolve in the build output.

The checker skips external links. For external links, point a tool such as [lychee](https://github.com/lycheeverse/lychee) at your deployed site.

## Why Faster

The common approach checks links per file. When 400 pages link to `/docs/get-started`, the common approach checks `/docs/get-started` 400 times. This plugin deduplicates first and checks every unique destination once. File reads and existence checks run in parallel.

## Installation

```shell-session
npm install astro-better-link-checker
```

## Usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import linkChecker from 'astro-better-link-checker';

export default defineConfig({
  integrations: [linkChecker()],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `excludeSourcePages` | `(string\|RegExp)[]` | `[]` | Pages to skip crawling. The checker ignores every link on a matching page. |
| `excludeDestinations` | `(string\|RegExp)[]` | `[]` | Destinations to skip checking, including anchors on those destinations. |
| `failOnBrokenLinks` | `boolean` | `true` | Exit the build with code `1` when the checker finds a broken link, image, or anchor. |
| `checkAnchors` | `boolean` | `true` | Check each `#fragment` against the `id` and `<a name>` attributes on the target page. |
| `checkImages` | `boolean` | `true` | Check `src` on `<img>`, `<source>`, `<video>`, and `<audio>`, and `srcset` on any element. |
| `verbose` | `boolean` | `false` | Log every checked link, image, and anchor, not only broken ones. |

`excludeSourcePages` and `excludeDestinations` accept strings and `RegExp` objects:

* A string matches by prefix. `'/login'` excludes every path that starts with `/login`, such as `/login/callback`. The string works like the regex `/^\/login/`.
* A `RegExp` tests the full path. Use a regex for a pattern that doesn't start at the beginning of the path, or for an exact match.

```ts
excludeDestinations: [
  '/login',           // prefix: skips /login, /login/callback, /login?next=...
  '/external-tool/',  // prefix: skips /external-tool/ and everything beneath it
  /\/beta\//,         // regex: skips any path containing /beta/ (not anchored)
  /\.(pdf|zip)$/,     // regex: skips paths ending in .pdf or .zip
  /^\/exact-path$/,   // regex: skips only the exact path /exact-path
]
```

## Output

A clean build prints the following summary:

```
[link-checker] 4231 HTML files
[link-checker] 8847 unique destinations
[link-checker] done in 2.1s
[link-checker] all links ok
```

On failure, the checker lists each broken destination with up to five source pages. Broken anchors include the fragment, and broken images start with `img`:

```
[link-checker] 3 broken links, 1 broken image:
  /docs/api/old-endpoint
    /docs/api/index
  /docs/get-started#missing-section
    /docs/overview
  /docs/get-started/missing-page
    /docs/overview
    /docs/quickstarts/react
    … and 12 more
  img /img/missing.png
    /docs/overview
```

## Notes

* The checker resolves a relative href against the source file's location, then normalizes the href to a root-relative path.
* A link to a path resolves when the build output contains the path as a file, as `<path>.html`, or as `<path>/index.html`.
* A fragment-only link, such as `#options`, resolves against the current page.
* When a target page doesn't exist, the checker reports the page once and skips the anchor checks for links to the page.

## Markdown Link Syntax Checker

The package also exports `markdownLinkSyntaxChecker`, which scans the `.md` and `.mdx` files in `srcDir` for malformed links. A malformed link renders as plain text, so the HTML link checker never sees the link. The syntax checker reports the following mistakes:

* `missing-close-bracket`: a missing `]` before the URL, as in `[text(/docs/page)`.
* `space-before-href`: whitespace between `]` and `(`, as in `[text] (/docs/page)`.

The syntax checker skips front matter, code blocks, inline code, comments, import and export lines, and JSX string attributes.

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import linkChecker, { markdownLinkSyntaxChecker } from 'astro-better-link-checker';

export default defineConfig({
  integrations: [markdownLinkSyntaxChecker(), linkChecker()],
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `excludePaths` | `(string\|RegExp)[]` | `[]` | Files to skip, matched against the path relative to `srcDir`. |
| `extensions` | `string[]` | `['.md', '.mdx']` | File extensions to scan. |
| `failOnIssues` | `boolean` | `true` | Exit the build with code `1` when the syntax checker finds an issue. |

The syntax checker prints each issue with the file, line, column, and kind:

```
[md-link-syntax] 1 issue:
  content/docs/setup.mdx:12:5  [space-before-href]  [Setup] (/docs/setup)
```
