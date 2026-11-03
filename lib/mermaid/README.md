# astro-better-mermaid

Astro integration that renders ` ```mermaid ` code blocks to inline SVG at build time. No client-side JavaScript is shipped to the browser.

Rendering happens via [svgdom](https://github.com/svgdotjs/svgdom), a headless DOM shim that convinces mermaid it is running in a browser. It is not running in a browser.

## Installation

```
npm install astro-better-mermaid mermaid
```

`mermaid` is a peer dependency, so install it alongside this package. `svgdom` comes with this package.

## Usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import mermaidSSR from 'astro-better-mermaid';

export default defineConfig({
  integrations: [mermaidSSR()],
});
```

Mermaid code blocks in your Markdown and MDX files will be replaced with pre-rendered SVG wrapped in a `<div class="mermaid">` at build time. Blocks that fail to render are left as fenced code blocks.

## Options

```ts
mermaidSSR({
  theme: 'default',       // mermaid theme — 'default', 'dark', 'neutral', 'forest'
  securityLevel: 'loose', // mermaid securityLevel
  titleFix: true,         // parse title="..." from code block meta as a caption
  injectCSS: true,        // inject the bundled stylesheet automatically
  cache: true,            // cache rendered diagrams on disk between builds
  cacheDir: 'node_modules/.cache/astro-better-mermaid', // where the cache lives
})
```

Rendered diagrams are cached by Mermaid version, theme, security level, and diagram source, so unchanged diagrams skip rendering on later builds. Releases that change how diagrams render also invalidate the cache. Each SVG id comes from the diagram's position on the page and a hash of its source, so output is stable from build to build.

### Diagram titles

With `titleFix` enabled, you can add a caption to any code block via its meta string:

````
```mermaid title="Authentication flow"
...
```
````

Captions on mermaid blocks appear below the diagram; captions on other code blocks appear above.

## Styles

The integration injects a default stylesheet that covers light mode and dark mode. Dark mode is driven by a `.dark` class on an ancestor element (the Tailwind `darkMode: 'class'` convention).

To use your own styles instead, set `injectCSS: false` and import the bundled CSS as a starting point:

```css
@import 'astro-better-mermaid/style.css';
```

`astro-better-mermaid/styles.css` resolves to the same file, for parity with releases before 0.1.2.

### Custom cluster fill colors

Mermaid's `style X fill:#color` directive injects `!important` inline styles that block CSS overrides. This integration strips the `!important` from cluster background rects and stores the original color in a `data-fill-color` attribute. The default stylesheet handles `#999` and `#944`. For other colors, add rules of the form:

```css
.cluster > rect[data-fill-color="#abc"] { fill: your-color !important; }
.dark .cluster > rect[data-fill-color="#abc"] { fill: your-dark-color !important; }
```

## Upgrading to 0.3.0

Labels now fit their shapes: multi-line labels get room for every line, and text is centered in cylinders and other shapes and on edge label backgrounds. Rendering changed, so cached diagrams render again after you upgrade.

If you set `injectCSS: false` and copied the stylesheet into your own CSS, update your copy:

1. Remove `transform: translateY(16px) !important;` from the `.edgeLabel rect` rules in both themes. It made up for the old edge label measurement and now pushes label backgrounds below their text.
1. Color `.loopText` and `.sectionTitle` like body text in both themes, so `alt`, `loop`, and `else` conditions in sequence diagrams stay readable. The light theme used to color `.loopText` almost white.

## Using the remark plugins directly

If you prefer to wire up the remark plugins yourself:

```ts
import { remarkMermaidSSR, mermaidTitleFix } from 'astro-better-mermaid';

export default defineConfig({
  markdown: {
    remarkPlugins: [
      mermaidTitleFix,
      [remarkMermaidSSR, { theme: 'default' }],
    ],
  },
  vite: {
    ssr: { external: ['svgdom', 'mermaid'] },
  },
});
```

`svgdom` and `mermaid` must be listed in `vite.ssr.external` — they are Node-only packages and cannot be bundled into client output.

## Sätteri

When `markdown.processor` is a [Sätteri](https://satteri.bruits.org/) processor, the integration adds its Sätteri plugins to that processor instead of registering remark plugins. Pass the same processor to `mdx()` so MDX files get them too:

```ts
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import mermaidSSR from 'astro-better-mermaid';

const processor = satteri();

export default defineConfig({
  markdown: { processor },
  integrations: [mdx({ processor }), mermaidSSR()],
});
```

To wire the plugins yourself, use `mermaidTitle` and `mermaidSSR` from `astro-better-mermaid/satteri`, in that order. They take the same options as the remark plugins.

