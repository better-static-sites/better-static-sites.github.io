# astro-better-release-notes

Configurable release notes components for Astro with category chip filtering, sticky version navigation, and deep-linkable release note items.

## Installation

```
npm install astro-better-release-notes
```

Import the stylesheet once in your root layout:

```astro
---
import 'astro-better-release-notes/style.css';
---
```

## Components

- `ReleaseNotes` - renders a unified sticky header (version selector + category filter chips) and the full version list
- `ReleaseNotesItem` - a single categorized release note row (used inside MDX content)
- `ReleaseNotesSelector` - a standalone version jump dropdown (for custom layouts that need it separately)

## Usage

### Content collection setup

Your content collection entries must have at minimum:

```ts
// src/content.config.ts
const releases = defineCollection({
  schema: z.object({
    version: z.string(),
    date:    z.coerce.date(),
    name:    z.string().optional(),
    // optional; rendered as HTML in a collapsed summary under the version header
    description: z.string().optional(),
  }),
});
```

Each `.mdx` file in the collection uses `ReleaseNotesItem`:

```mdx
---
version: "2.1.0"
date: 2024-05-01
---
import { ReleaseNotesItem } from 'astro-better-release-notes';

<ReleaseNotesItem category="new-feature">Added dark mode.</ReleaseNotesItem>
<ReleaseNotesItem category="fix" issue="42" issueBaseUrl="https://github.com/org/repo/issues/">Fixed login redirect loop.</ReleaseNotesItem>
```

### Page component

`ReleaseNotes` renders everything in one call: a sticky header containing the version selector and filter chips, then the full version list below.

```astro
---
import { getCollection, render } from 'astro:content';
import { ReleaseNotes, DEFAULT_CATEGORIES } from 'astro-better-release-notes';

const allUpdates = await getCollection('releases');
const updates = allUpdates
  .sort((a, b) => {
    const d = b.data.date.valueOf() - a.data.date.valueOf();
    return d !== 0 ? d : b.data.version.localeCompare(a.data.version, undefined, { numeric: true });
  });

const rendered = await Promise.all(
  updates.map(async item => {
    const { Content } = await render(item);
    return { data: item.data, Content };
  })
);
---

<ReleaseNotes updates={rendered} categories={DEFAULT_CATEGORIES} />
```

### ReleaseNotes props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `updates` | `ReleaseEntry[]` | required | Pre-rendered version entries |
| `categories` | `Category[]` | `DEFAULT_CATEGORIES` | Category definitions |
| `components` | `Record<string, any>` | `{}` | Component overrides (e.g. custom `ReleaseNotesItem`) |
| `showSelector` | `boolean` | `true` | Set `false` to hide the version jump dropdown |

### Sticky offset and scroll margins

Two CSS custom properties control the positioning:

`--release-notes-top` -- how far the sticky header sits from the viewport top (should match your site's fixed nav height). Default: `3.5rem`.

`--release-notes-scroll-margin` -- the `scroll-margin-top` applied to version headings and individual release note rows, which are the targets of anchor links and the version selector. Set it to at least the distance from the viewport top to the bottom edge of the release notes sticky header (your nav plus the selector and chip rows), or anchored headings land underneath the header. The chip rows wrap with viewport width, so measure at your breakpoints. Default: `5rem`.

```css
/* in your root layout or global CSS */
html {
  --release-notes-top: 56px;
  --release-notes-scroll-margin: 6rem; /* nav + sticky header height */
}

@media (min-width: 1024px) {
  html {
    --release-notes-top: 80px;
    --release-notes-scroll-margin: 11rem;
  }
}
```

Set both variables on `html` or any ancestor of `.release-container`.

### Link colors

The issue links, version permalinks (`#`), and category badge hover colors are configurable:

| Variable | Default | Description |
|----------|---------|-------------|
| `--release-notes-link-color` | `#4338ca` (indigo-700) | Issue link and permalink color |
| `--release-notes-link-hover-color` | `#9a3412` (orange-800) | Hover color for links, permalinks, and badges |
| `--release-notes-link-color-dark` | `#818cf8` (indigo-400) | Dark mode link and permalink color |
| `--release-notes-link-hover-color-dark` | `#fed7aa` (orange-200) | Dark mode hover color |
| `--release-notes-anchor-size` | `1.5em` | Font size of the version permalink; match it to your `h2` size |

The permalink sits beside the version heading rather than inside it, so it doesn't inherit the heading's size. Set `--release-notes-anchor-size` if your `h2` isn't `1.5em`.

### Theme variables

Set these on `:root` (and `.dark` for dark mode) to match your site. Each falls back to the default shown.

| Variable | Light default | Dark default | Used for |
|----------|---------------|--------------|----------|
| `--rn-bg` | `white` | `#0f172a` | Sticky header background |
| `--rn-border` | `#d1d5db` | `#4b5563` | Selector and filter button borders |
| `--rn-input-bg` | `#f3f4f6` | `#1e293b` | Selector and filter button background |
| `--rn-text` | `#111827` | `#cbd5e1` | Selector text |
| `--rn-text-muted` | `#374151` | `#cbd5e1` | Filter button text |
| `--rn-focus` | `#6366f1` | `#818cf8` | Focus rings and the active-filter indicator |
| `--rn-chip-bg` | `#f1f5f9` | `#1e293b` | Unselected chip background |
| `--rn-chip-border` | `#cbd5e1` | `#475569` | Unselected chip border |
| `--rn-chip-color` | `#334155` | `#cbd5e1` | Unselected chip text |
| `--rn-color-{category}` | see `DEFAULT_CATEGORIES` | same | Category color for chips and badges |

If you map these to your own palette, check that `--rn-chip-color` and `--rn-text-muted` keep a 4.5:1 contrast ratio against `--rn-chip-bg` and `--rn-input-bg`.

### Mobile filter behavior

On narrow screens the category filter chips are hidden behind a "Filter" toggle button that sits next to the version selector. Tapping it expands the chips below the selector row. When any filter is active, the button changes color as a visual indicator.

On screens 1024px and wider, the chips are always visible.

## Custom categories

Pass a `categories` array to `ReleaseNotes` to define your own set:

```js
const MY_CATEGORIES = [
  { id: 'new-feature', label: 'New Feature', color: '#16a34a' },
  { id: 'fix',         label: 'Fix',         color: '#d97706' },
  { id: 'security',    label: 'Security',    color: '#566f98' },
];
```

Category IDs must match the `category` prop values used in your MDX files.

## Custom ReleaseNotesItem

To inject project-specific behavior (e.g. a fixed issue base URL), pass a wrapper component via the `components` prop:

```astro
---
// src/components/MyReleaseNotesItem.astro
import { ReleaseNotesItem } from 'astro-better-release-notes';
const { issue, bonusIssue, ...rest } = Astro.props;
const base = 'https://github.com/org/repo/issues/';
---
<ReleaseNotesItem
  {...rest}
  issue={issue}
  bonusIssue={bonusIssue}
  issueBaseUrl={base}
  categoryColor={rest.categoryColor}
  categoryLabel={rest.categoryLabel}
><slot /></ReleaseNotesItem>
```

```astro
<ReleaseNotes
  updates={rendered}
  categories={MY_CATEGORIES}
  components={{ ReleaseNotesItem: MyReleaseNotesItem }}
/>
```

Note: for the `components` injection to work with categories, you also need to pass `categoryColor` and `categoryLabel` in your wrapper. Use the exported helpers:

```js
import { getCategoryColor, getCategoryLabel, DEFAULT_CATEGORIES } from 'astro-better-release-notes';
```

## ReleaseNotesItem props

| Prop | Type | Description |
|------|------|-------------|
| `category` | `string` | Category ID; must match a configured category |
| `issue` | `string` | Issue number shown as a link at row end |
| `bonusIssue` | `string` | Secondary issue number |
| `thanks` | `string` | GitHub username to credit |
| `bonusThanks` | `string` | Secondary GitHub username |
| `since` | `string` | Version this was introduced |
| `resolvedIn` | `string` | Version a known issue was resolved in |
| `viaIssue` | `string` | Issue that resolved a known issue |
| `issueBaseUrl` | `string` | Base URL for issue links (no default) |
| `categoryColor` | `string` | CSS color for the badge (default `#71717a`) |
| `categoryLabel` | `string` | Human label for the badge (default: generated from id) |

## Injecting category color and label automatically

`ReleaseNotes.astro` does not automatically inject `categoryColor`/`categoryLabel` into the MDX-rendered items -- those props come from the MDX markup. To automate this, create a wrapper that looks up the category in your list and injects the values, then pass it via `components`.

## Standalone ReleaseNotesSelector

`ReleaseNotesSelector` is available as a standalone component for custom layouts that need the version dropdown without the rest of the notes. It is not sticky by default; wrap it in your own sticky container if needed.

```astro
import { ReleaseNotesSelector } from 'astro-better-release-notes';
---
<div style="position: sticky; top: 56px;">
  <ReleaseNotesSelector {updates} />
</div>
```

## Accessibility

- Each version is an `<article>` labelled by its `<h2>`. The `<h2>` carries the anchor id (`version-1-2-3`), so fragment links, search crawlers, and TOC tools all resolve to the heading. The `#` permalink sits next to the heading rather than inside it, so the heading's accessible name is only the version.
- Category filters are native checkboxes inside a `<fieldset>` with a visually hidden `<legend>`. They work with Tab and Space, show a focus ring on the chip, and announce their checked state. Selected chips show a check mark as well as color.
- Badge and selected-chip text colors are mixed from the category color (darker in light mode, lighter in dark mode), so they stay at or above 4.5:1 for the default categories and for most custom mid-tone colors.
- The version selector has a label, and its options are bare version numbers, so typing `1.56` jumps to 1.56.0. Each jump is announced through a polite live region. Focus stays on the selector so type-ahead and arrow keys keep working: the selector scrolls with `scrollIntoView` and updates the URL with `history.replaceState`, because assigning `location.hash` would blur it. Jumps don't add browser history entries.
- Transitions and the badge hover scale are disabled under `prefers-reduced-motion: reduce`.
- The package ships its own `.rn-sr-only` class, so it doesn't depend on a host `sr-only` utility.

## Upgrading to 0.3.1

- `description` now renders as HTML, so it can contain inline markup such as links. Escape a literal `<` or `&` in a plain-text description.

## Upgrading to 0.3.0

- An entry with a `description` now shows it in a collapsed `<details>` summary under the version header. Entries without one render as before.

## Upgrading to 0.2.3

- Version selector options no longer start with "Version" (`1.56.0 (SSO Snake)` instead of `Version 1.56.0 (SSO Snake)`).
- Choosing a version updates the URL with `history.replaceState` instead of a new history entry, so the Back button leaves the page rather than stepping back through jumps.
- The version permalink now uses the link color variables and `--release-notes-anchor-size` instead of inheriting the surrounding text color and size.

## Upgrading to 0.2.2

Anchor URLs are unchanged, but the markup moved:

- The version id moved from `<article class="version">` to its `<h2>`. Update any CSS or scripts that target `article.version[id]` or `.version:target`.
- `--release-notes-scroll-margin` now applies to the heading instead of the article, which starts slightly higher. If anchored headings land under your sticky header, increase the value (see [Sticky offset and scroll margins](#sticky-offset-and-scroll-margins)).
- The permalink is now `.version-title .anchor-link`, outside the `<h2>`. Selectors using `.release-note .anchor-link` need updating.
- The filter container is a `<fieldset>` instead of a `<nav>`, and keeps the `release-notes-filters` id and `filter-controls` class.

## Dark mode

The stylesheet uses a `.dark` ancestor class (compatible with Tailwind's `darkMode: 'class'`). To also enable automatic OS-based dark mode, add to your project CSS:

```css
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    /* copy the .dark rules you need, or add the .dark class via JS */
  }
}
```

Most Tailwind setups initialize the `.dark` class from OS preference on first load, so no extra CSS is needed.
