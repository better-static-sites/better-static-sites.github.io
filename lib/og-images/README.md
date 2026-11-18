# astro-better-og-images

Open Graph images for every page of an Astro site, generated at build time. Pages without an image get a 1200x630 title card. Pages with their own PNG, JPEG, or WebP image get a 1200x630 JPEG copy, small enough for platforms that reject large previews.

The integration doesn't use a browser. Text becomes glyph outlines from a bundled font, and [sharp](https://sharp.pixelplumbing.com/) rasterizes the result, so the output looks the same on every build machine. Images render while Astro builds pages, are named by a hash of their content, and are cached between builds.

## Installation

```sh
npm install astro-better-og-images
```

`sharp` is a peer dependency. Astro already installs `sharp` for image optimization.

## Setup

Add the integration:

```js
// astro.config.mjs
import { readFileSync } from 'node:fs';
import ogImages from 'astro-better-og-images';

export default defineConfig({
  integrations: [
    ogImages({
      siteName: 'Example Docs',
      footer: 'example.com',
      logo: readFileSync('src/assets/logo.svg', 'utf-8'),
    }),
  ],
});
```

Then add the meta tags to your page's `<head>`:

```astro
---
import { getOgImage } from 'astro-better-og-images/runtime';

const { title, image } = Astro.props;
const og = await getOgImage({ title, label: 'Guides', source: image });
const ogUrl = new URL(og.url, Astro.url);
---
<meta property="og:image" content={ogUrl} />
{og.type && <meta property="og:image:type" content={og.type} />}
{og.width && <meta property="og:image:width" content={String(og.width)} />}
{og.height && <meta property="og:image:height" content={String(og.height)} />}
<meta property="og:image:alt" content={og.alt} />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content={ogUrl} />
<meta name="twitter:image:alt" content={og.alt} />
```

Set `site` in your Astro config, so the image URLs are absolute.

## `getOgImage` Arguments

| Argument | Description |
|---|---|
| `title` | The page title, without a site suffix. |
| `label` | Optional text above the title, such as the section name. |
| `source` | Optional path in `public/` to the page's own image. A raster image gets a resized copy. An SVG or a missing file gets a title card. An absolute URL is used as is. |
| `alt` | Optional alt text. The default describes the card, such as `Example Docs Guides: Install`. |

## Options

| Option | Default | Description |
|---|---|---|
| `route` | `'/og'` | URL prefix for the generated images. |
| `siteName` | `''` | Used in the alt text, and as the wordmark unless you set `wordmark`. |
| `wordmark` | `siteName` | Text next to the logo, or an array of `{ text, color }` segments for a two-color wordmark. |
| `logo` | none | SVG markup, drawn at 64x64. The SVG's `viewBox` is kept. |
| `footer` | `''` | Small text at the bottom, such as the site's domain. |
| `font` | Inter Bold | Path to a TTF, OTF, or WOFF file. WOFF2 isn't supported. |
| `colors` | dark slate | `background`, `wordmark`, `label`, `title`, `footer`, and `bar`. Set `bar` to `false` to hide the accent bar. |
| `cacheDir` | `node_modules/.cache/astro-better-og-images` | Where rendered images persist between builds. |

## Caching in CI

Restore and save the cache directory around the build. Images are named by content, so the newest cache is always safe to restore. The build deletes images no page uses anymore:

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules/.cache/astro-better-og-images
    key: og-images-${{ runner.os }}-${{ github.run_id }}
    restore-keys: og-images-${{ runner.os }}-
```

Put the step after `npm ci`, because `npm ci` deletes `node_modules`.

## Performance

Rendering runs on the libuv thread pool while Astro renders pages. The integration raises `UV_THREADPOOL_SIZE` to the number of CPU cores, unless you set the variable yourself. On a 14-core machine, about 2,000 cards add about 3 seconds to a build with an empty cache, and about 0.3 seconds with a full cache.

## License

The bundled Inter font is licensed under the SIL Open Font License. See `src/fonts/inter-LICENSE.txt`. The code is MIT licensed.
