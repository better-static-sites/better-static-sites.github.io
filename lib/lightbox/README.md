# astro-better-lightbox

Accessible lightbox for Astro that needs no JavaScript. A reader clicks an image, a screenshot, or a diagram, and the content opens enlarged in a native modal `<dialog>`. The browser handles focus, the Escape key, and focus return through [invoker commands](https://developer.mozilla.org/docs/Web/API/Invoker_Commands_API).

Invoker commands work in Chrome 135, Firefox 144, Safari 26.2, and later. In older browsers, the content shows inline and the **Enlarge** button does nothing.

For live examples, see the [Lightbox docs](https://better-static-sites.github.io/content/lightbox).

## Installation

```shell-session
npm install astro-better-lightbox
```

## Usage

Wrap any content in `<Lightbox>`, and give the lightbox a `label` that names the content:

```mdx
import Lightbox from 'astro-better-lightbox/Lightbox.astro';

<Lightbox label="The login page with the passkey button.">
  <img src="/img/login.png" alt="The login page with the passkey button." />
</Lightbox>
```

To show different markup in the dialog, such as a larger image, put the markup in the `zoom` slot:

```mdx
<Lightbox label="The login page.">
  <img src="/img/login-small.png" alt="The login page." />
  <img slot="zoom" src="/img/login-large.png" alt="The login page." />
</Lightbox>
```

### Lightbox Every Markdown Image

To open every markdown image in a lightbox, map `img` to `LightboxImage` in your MDX layout or `components` prop:

```astro
---
import LightboxImage from 'astro-better-lightbox/LightboxImage.astro';
const { Content } = await entry.render();
---
<Content components={{ img: LightboxImage }} />
```

### Screenshots and Diagrams

The following packages build lightboxes with this package:

* `astro-better-declarative-screenshots` with the `lightbox` config option or prop.
* `astro-better-mermaid` with the `lightbox` option.

Build-time plugins can call the helper directly. `lightboxHtml(content, options)` returns the markup as a string, and `uniqueIds(html, suffix)` renames the ids in a copy of inline SVG, so the copy can sit on the same page as the original:

```js
import { lightboxHtml, uniqueIds } from 'astro-better-lightbox';

const html = lightboxHtml(svg, { label: 'Login flow', zoom: uniqueIds(svg, '-zoom') });
```

When you use only the helper, import `astro-better-lightbox/styles.css` yourself.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | `''` | Accessible name for the dialog. The open button reads "Enlarge: " followed by the label |
| `id` | `string` | hash of the content | Dialog id |
| `class` | `string` | -- | Extra class(es) on the wrapper |
| `disabled` | `boolean` | `false` | Render the content alone, without the button and dialog |

## Slots

| Slot | Description |
|------|-------------|
| (default) | Content shown inline, and in the dialog unless `zoom` is set |
| `zoom` | Content shown in the dialog |

## Accessibility

* The open button sits after the content and stretches over the content, so screen readers read the content itself, and keyboard users tab to **Enlarge**.
* The dialog is modal. The rest of the page becomes inert, focus moves to **Close**, and focus returns to **Enlarge** when the dialog closes.
* Escape, a click anywhere in the dialog, or **Close** closes the dialog.
* The closed dialog carries `data-markdown-ignore` and `data-pagefind-ignore`, so the copy stays out of generated markdown and search indexes.

## Theming

Set these custom properties on `.abl-lightbox`:

| Property | Controls |
|----------|----------|
| `--abl-lightbox-bg` | Dialog background. Defaults to 95% opaque white, or slate in dark mode |
| `--abl-lightbox-button-bg` | Background of the **Enlarge** and **Close** icons |
| `--abl-lightbox-button-fg` | Icon color |
| `--abl-lightbox-focus` | Keyboard focus ring color |
| `--abl-lightbox-padding` | Space between the dialog edge and the content |
| `--abl-lightbox-max-zoom` | How far `astro-better-mermaid` enlarges a diagram past its natural width (default `2.5`) |

Dark mode follows `class="dark"` or `data-theme="dark"` on `<html>`.

## License

MIT
