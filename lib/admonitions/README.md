# astro-better-admonitions

Extensible admonition (callout block) and inline badge components for Astro. Supports configurable types with icons and colors, a named-slot title for rich markup, and both block and inline display modes.

## Installation

```
npm install astro-better-admonitions
```

Import the stylesheet once in your root layout:

```astro
---
import 'astro-better-admonitions/style.css';
---
```

## Basic usage

```astro
---
import { Admonition } from 'astro-better-admonitions';
---

<Admonition type="note">This is a note.</Admonition>
<Admonition type="tip" title="Pro tip">Use keyboard shortcuts.</Admonition>
<Admonition type="caution">Proceed carefully.</Admonition>
<Admonition type="danger">This cannot be undone.</Admonition>
```

Built-in types: `note`, `tip`, `caution`, `danger`.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `string` | `'note'` | Key into the type map |
| `title` | `string` | type label | Override the title text. Supports inline markdown: `` `code` ``, `**bold**`, and `*italic*` |
| `types` | `Record<string, AdmonitionTypeConfig>` | `{}` | Extend or override built-in types |
| `display` | `'block' \| 'inline' \| 'auto'` | `'block'` | Rendering mode |
| `titleBold` | `boolean` | `true` | Bold title text |
| `renderif` | `boolean` | `true` | Conditionally suppress rendering |
| `class` | `string` | `''` | Extra CSS classes on the root element |

## Extending types

Pass a `types` object to merge with the built-in types:

```astro
---
import { Admonition, DEFAULT_TYPES } from 'astro-better-admonitions';

const MY_TYPES = {
  ...DEFAULT_TYPES,
  info: {
    label: 'Info',
    color: '#0ea5e9',
    icon: { viewBox: '0 0 16 16', d: '...' },
  },
};
---

<Admonition type="info" types={MY_TYPES}>Custom type.</Admonition>
```

For a project-wide custom type set, create a wrapper component:

```astro
---
// src/components/Admonition.astro
import { Admonition as Base, DEFAULT_TYPES } from 'astro-better-admonitions';

const MY_TYPES = { ...DEFAULT_TYPES, info: { ... } };
const { type, ...rest } = Astro.props;
---
<Base type={type} types={MY_TYPES} {...rest}><slot /><slot name="title" slot="title" /></Base>
```

## Inline badge mode

Set `display="inline"` to render a small pill badge instead of a block callout.
Set `display="auto"` to switch automatically: badge when no content slot, callout when content is present.

```astro
<p>This field is <Admonition type="note" display="inline" title="Required" /> in all requests.</p>
```

## Rich title markup

The `title` prop renders inline markdown, so code, bold, and italic text work without a slot:

```astro
<Admonition type="caution" title="The Docker `latest` tag is not dynamic">...</Admonition>
```

Use the named `title` slot when the title needs other HTML, such as a link:

```astro
<Admonition type="note" display="inline">
  <Fragment slot="title">Available since <code>2.0.0</code></Fragment>
</Admonition>
```

## AdmonitionTypeConfig shape

```ts
interface AdmonitionTypeConfig {
  label: string;    // default title text
  color: string;    // CSS color value for border/accent/badge
  icon?: {
    viewBox: string;
    d: string;      // SVG path data
  };
}
```

## Dark mode

The stylesheet supports both `@media (prefers-color-scheme: dark)` and a `.dark` ancestor class. If your project uses Tailwind's class-based dark mode, both are covered automatically.
