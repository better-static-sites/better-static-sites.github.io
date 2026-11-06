# astro-better-tabs

Tabbed content for Astro. Labels support inline markdown. Multiple independent tab groups on the same page work without configuration. Zero client-side JavaScript: the DOM is reorganized at build time and panel switching uses CSS `:has()`.

## Installation

```sh
npm install astro-better-tabs
```

## Basic usage

```astro
---
import Tabs from 'astro-better-tabs/Tabs.astro';
import TabItem from 'astro-better-tabs/TabItem.astro';
---

<Tabs>
  <TabItem label="macOS">
    Install with Homebrew: `brew install fusionauth-app`
  </TabItem>
  <TabItem label="Linux">
    Download the `.deb` or `.rpm` package from the releases page.
  </TabItem>
  <TabItem label="Windows">
    Download the `.msi` installer from the releases page.
  </TabItem>
</Tabs>
```

The first tab is selected by default. Clicking a label switches the visible panel.

## Props

### `<Tabs>`

No props. Wraps any number of `<TabItem>` children.

### `<TabItem>`

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Tab label text. Supports inline markdown (bold, italic, inline code, links). |

## Markdown labels

Labels are processed as inline markdown, so you can use formatting:

```astro
<Tabs>
  <TabItem label="`curl`">...</TabItem>
  <TabItem label="**Node.js** SDK">...</TabItem>
  <TabItem label="[Python](https://python.org)">...</TabItem>
</Tabs>
```

## Multiple tab groups

Each `<Tabs>` generates its own unique radio group name, so multiple groups on the same page are fully independent:

```astro
<Tabs>
  <TabItem label="Request">...</TabItem>
  <TabItem label="Response">...</TabItem>
</Tabs>

<Tabs>
  <TabItem label="macOS">...</TabItem>
  <TabItem label="Linux">...</TabItem>
</Tabs>
```

## How it works

`TabItem` renders two things per tab: a `<div class="tab-bar-item">` wrapping a hidden `<input type="radio">` and a `<label>`, followed by a `<div class="tab-panel">`.

`Tabs` renders the slot HTML and then does two string-replacement passes at build/server time:

1. Injects a unique `name` attribute into every radio input and marks the first one `checked`.
2. Extracts every `<div class="tab-bar-item">` wrapper, strips the wrapper element, and places the extracted inputs and labels into a `<nav class="tab-bar">` prepended to the output. The panels remain as direct `<div>` children of `.tabs-group` after the nav.

The nav is a `<nav>` element (not a `<div>`) so that `div:nth-of-type(n)` counts panels cleanly without needing to offset for the tab bar container.

Panel visibility is handled entirely by CSS `:has()` with pre-generated rules for up to 12 tabs:

```css
.tabs-group:has(> .tab-bar > .tab-input:nth-of-type(1):checked) > .tab-panel:nth-of-type(1) { display: block; }
.tabs-group:has(> .tab-bar > .tab-input:nth-of-type(2):checked) > .tab-panel:nth-of-type(2) { display: block; }
/* ... up to 12 */
```

The direct-child combinators (`>`) prevent an outer group's rules from accidentally showing panels in nested tab groups. `:has()` is supported in Chrome 105+, Firefox 121+, and Safari 15.4+.

## Styling

The component requires Tailwind CSS in the consuming project (`@reference "tailwindcss"` is used in the style block).

Light mode: inactive tab labels use a gray tab bar (`#e5e7eb`) with slightly lighter text (`#4b5563`). The active tab label has a white background that is flush with the white panel below it, creating a seamless appearance. Inactive labels have a 1px outline in the panel color, which sets them apart from each other and from the bar.

Dark mode: the active tab and panel share the site's dark background (`#0f172a`). The tab bar is slightly lighter (`#1e293b`) to distinguish inactive tabs, which use muted text (`#94a3b8`). The active label text color defaults to `#e2e8f0`.

Because Tailwind Typography's `prose` styles set explicit colors on `<span>` elements that beat CSS inheritance, the component uses targeted `!important` rules to control inactive and active label text colors.

### CSS custom properties

Override these on `.tabs-group` to customize colors:

| Variable | Default (light) | Default (dark) | Controls |
|---|---|---|---|
| `--tabs-border` | `#e5e7eb` | `#334155` | container border |
| `--tabs-bg` | `#e5e7eb` | `#1e293b` | container background (visible at rounded corners) |
| `--tabs-panel-bg` | `#ffffff` | `#0f172a` | panel background |
| `--tabs-active-bg` | `#ffffff` | `#0f172a` | active label background |
| `--tabs-active-color` | `#111827` | `#e2e8f0` | active label text color |
| `--tabs-hover-bg` | `#d9d9de` | `#666677` | inactive label background on hover |
| `--tabs-hover-color` | `#445599` | `#ffffff` | inactive label text color on hover |
| `--tabs-inactive-outline` | `--tabs-panel-bg` | `--tabs-panel-bg` | 1px outline around inactive labels, so their edges blend into the panel |
