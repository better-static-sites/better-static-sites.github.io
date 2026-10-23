# astro-better-gen-markdown-pages

Astro integration that generates a `.md` companion file for every HTML page in your build output, plus an `llms.txt` hub and per-category spoke files. Useful for giving LLMs a plain-text version of your documentation without a separate pipeline.

At build time, each HTML page is parsed and converted to Markdown. Rewrites internal links to point at the corresponding `.md` files. Tab panels that are hidden by default are revealed so their content is included.

In dev mode, any page can be previewed as Markdown by appending `?format=md` to its URL. The `llms.txt` endpoint returns a stub so nothing breaks during development.

## Installation

```shell-session
npm install astro-better-gen-markdown-pages
```

Peer dependency: `astro >= 4.0.0`.

## Basic usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import genMarkdownPages from 'astro-better-gen-markdown-pages';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    genMarkdownPages({
      llmsTxtTitle: 'My Documentation',
      llmsTxtDescription: 'Full reference for My Project.',
      indexFilter: (url) => url.startsWith('/docs/'),
      categorize: (url) => url.split('/')[2]?.replace(/\.md$/, '') || 'overview',
    }),
  ],
});
```

After a build, each `.html` file in the output directory gets a sibling `.md` file. A hub `llms.txt` and a mirror at `.well-known/llms.txt` are written next to it.

## llms.txt structure

### Without `spokesDir` (flat hub)

All entries are inlined in `llms.txt` under `## Category` headings:

```
# My Documentation

> Full reference for My Project.

## Guides

- [Getting Started](https://example.com/docs/guides/start.md): How to set up the project.
- [Configuration](https://example.com/docs/guides/config.md): All available options.

## API Reference

- [REST API](https://example.com/docs/api/overview.md): Full API reference.
- [Authentication](https://example.com/docs/api/auth.md): How to authenticate requests.
```

### With `spokesDir` (hub + spokes)

When `spokesDir` is set, the hub gets one `## Category` section per category. Each section opens with a link to the full spoke index file, followed by the root/overview page for that section and any pages one level deep. Pages nested deeper are only in the spoke.

```
# My Documentation

> Full reference for My Project.

## Overview

- [My Project](https://example.com/docs.md): What this project is and how to get started.

## Guides

- [Guides index](https://example.com/docs/llms-guides.txt)
- [Guides Overview](https://example.com/docs/guides.md): Browse all guides.
- [Getting Started](https://example.com/docs/guides/start.md)
- [Configuration](https://example.com/docs/guides/config.md)

## API Reference

- [API Reference index](https://example.com/docs/llms-api-reference.txt)
- [API Overview](https://example.com/docs/api.md): Full API reference.
- [REST API](https://example.com/docs/api/overview.md)
```

Each spoke file contains the full list of pages for that category, organized into `##`/`###`/`####` sections based on URL path depth:

```
# Guides

> Guides documentation.

- [Guides Overview](https://example.com/docs/guides.md)
- [Getting Started](https://example.com/docs/guides/start.md)
- [Configuration](https://example.com/docs/guides/config.md)

## Advanced

- [Custom Plugins](https://example.com/docs/guides/advanced/plugins.md)
- [Performance](https://example.com/docs/guides/advanced/performance.md)

### Deployment

- [Docker](https://example.com/docs/guides/advanced/deployment/docker.md)
- [Kubernetes](https://example.com/docs/guides/advanced/deployment/kubernetes.md)
```

The heading level mirrors URL depth within the category:

| URL depth after category | Heading |
|---|---|
| 0 (the root/overview page itself) | listed before any heading |
| 1 (e.g. `/docs/guides/start.md`) | listed before any heading |
| 2 (e.g. `/docs/guides/advanced/plugins.md`) | `##` |
| 3 (e.g. `/docs/guides/advanced/deployment/docker.md`) | `###` |
| 4 | `####` |

### Inline categories

Use `inlineCategories` to list certain categories directly in the hub (no spoke file) even when `spokesDir` is set. Useful for a small overview section:

```ts
genMarkdownPages({
  spokesDir: 'docs',
  inlineCategories: ['Overview'],
})
```

## Sibling page section

When `spokesDir` is set, the integration appends a "Other pages in [subsection]" section to the bottom of each generated `.md` file. The section links to the other pages in the same immediate subsection of the spoke, along with a reference to the full spoke index.

For a page in `/docs/guides/advanced/deployment/docker.md`, the sibling section lists other pages under `### Deployment`, not the entire Guides spoke. For a top-level page like `/docs/guides/start.md`, it lists other pages at the same depth in the Guides spoke root.

The sibling section is not added to the root/overview page for a category (the page whose URL is exactly `/{section}/{category}.md`), since it has no peers at the same level.

## Multiple instances

You can run multiple plugin instances in the same build, each owning a separate section of the site:

```ts
integrations: [
  genMarkdownPages({
    pageFilter: (url) => url.startsWith('/docs/'),
    indexFilter: (url) => url.startsWith('/docs/'),
    llmsTxtPath: 'docs/llms.txt',
    spokesDir: 'docs',
    // ...
  }),
  genMarkdownPages({
    pageFilter: (url) => url.startsWith('/blog/'),
    indexFilter: (url) => url.startsWith('/blog/'),
    llmsTxtPath: 'blog/llms.txt',
    // ...
  }),
]
```

Use `pageFilter` to prevent instances from overwriting each other's `.md` files. Each instance writes its own `llms.txt` independently.

## All options

```ts
genMarkdownPages({
  // Full URL of the llms.txt hub file, written in the backlink header of each .md file.
  // Defaults to `${site}/${llmsTxtPath}`.
  indexUrl: 'https://example.com/docs/llms.txt',

  // Return true to write a .md companion file for this page URL.
  // When multiple instances are used, set this so each instance owns its own section.
  // Default: include all pages.
  pageFilter: (urlPath) => urlPath.startsWith('/docs/'),

  // Return true to include a page in the llms.txt index.
  // Independent of pageFilter — a page can have a .md file but not appear in the index.
  // Default: include all pages.
  indexFilter: (urlPath) => urlPath.startsWith('/docs/'),

  // Map a page's URL path to a raw category key.
  // Return null or '' to exclude the page from the index.
  // Default: first non-empty path segment.
  categorize: (urlPath) => urlPath.split('/').filter(Boolean)[0] || 'root',

  // Convert a raw category key to a display name used in llms.txt headings.
  // Default: title-case with hyphens as word separators.
  formatCategoryName: (key) =>
    key.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),

  // Convert a sub-folder key to a heading in spoke files (## / ### / ####).
  // Defaults to formatCategoryName, so abbreviation overrides carry over automatically.
  formatSubsectionName: (key) =>
    key.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),

  // Sort category display names before writing.
  // Default: alphabetical.
  sortCategories: (names) => [...names].sort(),

  // Create llms.txt files.
  // Default: true
  createLlmsTxt: true,

  // Path to write llms.txt, relative to the build output directory.
  // Default: 'llms.txt'
  llmsTxtPath: 'docs/llms.txt',

  // H1 title written at the top of llms.txt.
  // Default: 'Documentation'
  llmsTxtTitle: 'My Documentation',

  // Blockquote description written below the H1. Omitted when empty.
  llmsTxtDescription: 'Full reference for My Project.',

  // Directory (relative to build output) where per-category spoke files are written.
  // When set, each non-inline category gets an llms-{slug}.txt file inside this directory
  // and the hub links to it via an H2 section.
  // When null (default), all entries are inlined in the hub.
  spokesDir: 'docs',

  // Category display names to inline in the hub even when spokesDir is set.
  // These categories get an H2 section in the hub with all their pages listed directly;
  // no spoke file is written for them.
  inlineCategories: ['Overview'],

  // URL of another llms.txt hub to cross-link in the header of each generated .md file.
  // Useful when this instance covers a sub-section (e.g. blog) and you want .md readers
  // to discover the primary docs index.
  docsIndexUrl: 'https://example.com/docs/llms.txt',

  // Placeholder string embedded in built HTML that gets replaced with the page's
  // public .md URL at build time. Use this in page templates to inject the .md link
  // without knowing the final path at author time.
  // Default: 'LLM_MD_PATH_PLACEHOLDER'
  mdPathPlaceholder: 'LLM_MD_PATH_PLACEHOLDER',

  // ID of a <link> element in the page <head> whose href is rewritten to the .md URL.
  // Allows discovery of the .md file via standard HTTP link headers.
  // Default: 'llm-md-link'
  mdLinkId: 'llm-md-link',

  // Trailing suffix to strip from extracted page titles.
  // Matched exactly, case-sensitively, after trimming whitespace.
  // Example: ' | My Site' turns "Getting Started | My Site" into "Getting Started".
  trimTitleSuffix: ' | My Site',
})
```

## Using the converter directly

The HTML-to-Markdown converter is exported for use outside the Astro integration:

```ts
import { htmlToMarkdown, createConverter, transformUrl } from 'astro-better-gen-markdown-pages';

// Convert a full HTML document
const { markdown, title, description } = htmlToMarkdown(html, {
  siteUrl: 'https://example.com',
  indexUrl: 'https://example.com/llms.txt',
  trimTitleSuffix: ' | My Site',
});

// Reuse a converter across many pages to avoid re-initializing Turndown on each call
const converter = createConverter();
for (const html of pages) {
  const { markdown } = htmlToMarkdown(html, { siteUrl, indexUrl, converter });
}
```

`htmlToMarkdown` looks for content inside `<article>`, then `<main>`, then `<body>`. It strips scripts, styles, SVGs without accessible names, buttons, navigation, footers, hidden elements, and screen-reader-only text before converting.

### Excluding specific elements

Add a `data-nomd` or `data-markdown-ignore` attribute to any HTML element to exclude it from the Markdown output without affecting its visibility in the browser:

```html
<div data-nomd>
  <!-- mobile action menu that duplicates the desktop sidebar -->
</div>
```

### MarkdownOnly

`MarkdownOnly` is the inverse: content that is hidden in the browser but included in the Markdown output. Use it for LLM-facing context that would clutter the visual page.

```astro
---
import MarkdownOnly from 'astro-better-gen-markdown-pages/MarkdownOnly.astro';
---
<MarkdownOnly>
  This text appears only in the generated .md file, not in the browser.
</MarkdownOnly>
```

Internally, `MarkdownOnly` renders a `<div data-mdonly class="hidden">`. The converter removes the `hidden` class from `[data-mdonly]` elements before conversion, so their content is included in the Markdown while remaining invisible in the browser.

### Tab panels

Hidden tab panels are revealed before conversion so their content is included in the Markdown output. Each panel's label becomes an `###` heading above the content, ensuring all tabbed content is discoverable by LLMs even when only one tab is visible in the browser.

### Card components

Card components (an `<a>` element wrapping block-level children like `<div>` or `<p>`) are wrapped in a block container before conversion so adjacent cards are separated by blank lines in the output rather than run together on a single line.

## `.well-known/llms.txt`

The hub file is mirrored at `.well-known/llms.txt` alongside the primary path. This follows the [llms.txt discovery convention](https://llmstxt.org/) and lets agents locate the index without knowing the exact path.
