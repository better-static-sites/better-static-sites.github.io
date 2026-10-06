# astro-better-code-blocks

Remark/rehype plugins and a copy-code web component for enhanced code blocks in Astro.

Replaces Astro's built-in Prism integration with a pipeline that adds:

- Line highlights with `{n,m-p}` syntax
- Collapsible line ranges with `[n-p]` syntax
- Diff overlay on any language with the `diff` keyword
- File name tabs with `title="..."` syntax
- A copy button that works correctly with all of the above
- Shell-session prompts excluded from clipboard copy without any client-side string manipulation

## Install

```
npm install astro-better-code-blocks
```

Peer dependencies: `@astrojs/prism`, `prismjs`. Both ship with Astro projects by default.

## Setup

In `astro.config.ts`:

```ts
import { rehypeCodeBlocks, remarkShellSession } from 'astro-better-code-blocks';

export default defineConfig({
  syntaxHighlight: false,
  markdown: {
    remarkPlugins: [remarkShellSession],
    rehypePlugins: [rehypeCodeBlocks],
  },
});
```

In your root layout, import the CSS and web component once:

```astro
---
import 'astro-better-code-blocks/style.css';
import CopyCodeButton from 'astro-better-code-blocks/CopyCodeButton.astro';
---
<html>
  <head>...</head>
  <body>
    <CopyCodeButton />
    <slot />
  </body>
</html>
```

`<CopyCodeButton />` injects an SVG sprite and the web component registration script. Because Astro deduplicates `<script>` tags, it's safe to import in multiple layouts.

## Sätteri

The `astro-better-code-blocks/satteri` entry point exports [Sätteri](https://satteri.bruits.org/) plugins that render the same HTML as the unified ones:

```ts
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { codeBlocks, shellSession } from 'astro-better-code-blocks/satteri';

const processor = satteri({
  mdastPlugins: [shellSession()],
  hastPlugins: [codeBlocks()],
});

export default defineConfig({
  markdown: { syntaxHighlight: false, processor },
  integrations: [mdx({ syntaxHighlight: false, processor })],
});
```

`shellSession` and `codeBlocks` take the same options as `remarkShellSession` and `rehypeCodeBlocks`.

## Configuration

Both plugins accept an options object. The Sätteri plugins take the same options.

### rehypeCodeBlocks

```ts
rehypeCodeBlocks({
  // Languages to skip entirely -- no highlighting, no copy button.
  excludeLangs: ['mermaid'],

  // Set to false to disable the copy button.
  copyButton: true,

  // Title tab position relative to the code block.
  title: { position: 'top' }, // 'top' | 'bottom'
})
```

### remarkShellSession

```ts
remarkShellSession({
  // Prompt string prepended to lines that don't already have one.
  prompt: '$ ',
})
```

## Syntax

### Line highlights

```js {2,4-6}
const a = 1;
const b = 2;  // highlighted
const c = 3;
const d = 4;  // highlighted
const e = 5;  // highlighted
const f = 6;  // highlighted
```

### Collapsible ranges

```json [3-8]
{
  "name": "my-project",
  "dependencies": {
    "astro": "^4.0.0",
    "prismjs": "^1.29.0",
    "hast-util-from-html": "^2.0.0",
    "unist-util-visit": "^5.0.0"
  },
  "version": "1.0.0"
}
```

Lines 3-8 are hidden by default with a "N hidden lines" toggle. Clicking it expands them inline.

### Diff overlay

Add `diff` to the meta string (after the language identifier) to overlay diff colors on syntax-highlighted code:

````
```ts diff
- const x: string = 'hello';
+ const x: string = 'world';
```
````

Lines starting with `+` get a green background; lines starting with `-` get a red background. Syntax highlighting still applies.

Note: this is different from writing ` ```diff ` with no language. That tells Prism to use the `diff` grammar (diff file format highlighting), and our overlay does not activate.

### File name tab

````
```ts title="src/config.ts"
export const siteTitle = 'My Site';
```
````

Renders a tab above the code block using `<figure>`/`<figcaption>` for semantic HTML. The tab style is controlled by `.code-figure .code-title` in the stylesheet.

### Shell sessions

Use the `shell-session` language for interactive terminal sessions:

````
```shell-session
npm install astro-better-code-blocks
```
````

`remarkShellSession` normalizes lines without a prompt by prepending `$ `. Prism then tokenizes the `$ ` as a `shell-symbol.important` token. The rehype plugin marks those tokens with `data-no-copy` so the copy button skips them entirely -- no client-side string manipulation.

Users who manually select and copy also get clean output because `[data-no-copy]` has `user-select: none`.

To include output lines (no prompt), write them explicitly:

````
```shell-session
$ npm run build
  > my-project@1.0.0 build
  > astro build
```
````

Lines that start with `$ ` or `# ` are treated as input. All other non-empty lines pass through untouched.

## Stylesheet

`style.css` is plain CSS with no dependencies. Dark mode uses `@media (prefers-color-scheme: dark)`.

If your project uses a class-based dark mode (e.g. Tailwind's `darkMode: 'class'`), add overrides in your own stylesheet:

```css
.dark pre[data-has-line-meta] code .line-highlighted {
  background-color: rgba(255, 230, 0, 0.08);
  box-shadow: inset 3px 0 0 0 rgba(255, 210, 0, 0.6);
}
```

The stylesheet uses no `!important` except where Prism's own styles require it.

## Custom Prism languages

Register additional languages before importing the plugin:

```ts
// prism-ftl.ts
import Prism from 'prismjs';
Prism.languages.ftl = { ... };

// astro.config.ts
import './src/prism-ftl.ts';
import { rehypeCodeBlocks } from 'astro-better-code-blocks';
```

Because Node caches modules, the registration runs once and the Prism instance used by `rehypeCodeBlocks` sees it.

## Copy button and build-time wrapping

`rehypeCodeBlocks` wraps every `<pre>` block in a `<div class="ccb-wrapper">` and injects a `<copy-code-button>` custom element at build time. The `CopyCodeButton.astro` component provides the runtime behavior.

Code blocks that don't go through the markdown/MDX pipeline (e.g., `<Prism>` components rendered directly in `.astro` files) are wrapped at runtime by the web component script as a fallback.

---

## astro-better-code-snippet-extractor

A companion package for loading [Bluehawk](https://mongodb-university.github.io/Bluehawk/)-annotated code snippets and raw source files into Astro pages.

Useful when your code examples live in a separate tested project rather than inline in your docs.

### Install

```
npm install astro-better-code-snippet-extractor
```

### Astro integration

The package includes an Astro integration that runs `bluehawk snip` automatically at build time and dev server start, replacing any manual `bluehawk snip` script calls. Each subdirectory of the source directory gets its own run, and the runs happen in parallel.

In `astro.config.ts`:

```ts
import { extractedCodeSnippets } from 'astro-better-code-snippet-extractor';

export default defineConfig({
  integrations: [
    extractedCodeSnippets(),
    // ...
  ],
});
```

The integration hashes the source directory on each startup and skips re-running bluehawk if nothing has changed, so dev server restarts are fast.

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `sourceDir` | `'extractedcode'` | Directory containing tested source projects, relative to the Astro project root |
| `outputDir` | `'src/generated-code-snippets'` | Where generated snippets are written |
| `ignore` | (common patterns) | Array of glob patterns forwarded to bluehawk `--ignore` |
| `plugin` | - | Optional bluehawk plugin path, relative to the project root |

If you use a custom bluehawk language plugin:

```ts
extractedCodeSnippets({ plugin: 'bluehawk-languages.js' })
```

### GitHub Actions templates

`templates/github-actions/` in the package repository contains three ready-to-copy workflow templates:

- `validate-snippets.yml` - validates Bluehawk annotations on PRs
- `test-extractedcode.yml` - runs `tests/test.sh` per changed directory on PRs (parallel matrix)
- `export-to-github.yml` - mirrors changed directories to external repos on push to main

Each template has `# REPLACE:` comments marking the parts you need to customize.

### Usage

```astro
---
import ExtractedCode from 'astro-better-code-snippet-extractor/ExtractedCode.astro';
---

<!-- Load a Bluehawk snippet (path contains ".snippet.") -->
<ExtractedCode
  src="myapp/login.snippet.login-handler.ts"
  lang="typescript"
  title="src/auth/login.ts"
/>

<!-- Load a raw source file -->
<ExtractedCode
  src="myapp/src/main.tsx"
  lang="tsx"
/>
```

### How it works

Paths containing `.snippet.` are resolved relative to `snippetRoot` (default: `src/generated-code-snippets`). All other paths are resolved relative to `sourceRoot` (default: `extractedcode`). Both defaults assume the standard Bluehawk workflow where you run `bluehawk snip` into `src/generated-code-snippets` and check in the annotated source under `extractedcode/`.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | required | Path to the file |
| `lang` | `string` | `'plaintext'` | Prism language identifier |
| `title` | `string` | - | Optional title tab |
| `snippetRoot` | `string` | `src/generated-code-snippets` | Root for snippet files |
| `sourceRoot` | `string` | `extractedcode` | Root for source files |

### With titles

When a `title` is provided, `ExtractedCode` renders:

```html
<figure class="code-figure">
  <figcaption class="code-title">src/auth/login.ts</figcaption>
  <!-- Prism output here -->
</figure>
```

This matches the markup that `rehypeCodeBlocks` produces for inline code blocks with `title="..."`, so both render identically if you import `astro-better-code-blocks/style.css`.
