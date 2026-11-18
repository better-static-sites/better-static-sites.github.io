# astro-better-glossary

A JSON glossary for Astro sites. Write `[[term]]` in MDX, and the term renders as a link to its page, with the definition in a tooltip that works with a keyboard and a screen reader. The `<Glossary>` component renders every entry on one page. An unknown term fails the build and suggests the closest matches.

## Installation

```sh
npm install astro-better-glossary
```

## Setup

Create a glossary file. Each key is the full name of a term:

```json
{
  "JSON Web Token": {
    "definition": "A signed, URL-safe token that carries claims. See [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519).",
    "link": "/concepts/tokens",
    "abbreviations": ["JWT"]
  }
}
```

Add the integration, and add the plugin to every markdown processor that renders MDX. Use the remark plugin with the unified processor, or the Sätteri plugin with Sätteri:

```js
// astro.config.mjs
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import glossary from 'astro-better-glossary';
import { remarkGlossaryTerms } from 'astro-better-glossary/remark';
// with Sätteri: import { glossaryTerms } from 'astro-better-glossary/satteri';

const terms = { file: 'src/data/glossary.json', path: '/glossary' };
const processor = unified({ remarkPlugins: [[remarkGlossaryTerms, terms]] });
// with Sätteri: satteri({ mdastPlugins: [glossaryTerms(terms)] })

export default defineConfig({
  markdown: { processor },
  integrations: [mdx({ processor }), glossary(terms)],
});
```

The plugin imports the term component into each document that uses a term, so you don't need to import anything.

## Writing Terms

```md
Each [[JSON Web Token]] carries claims.
Send the [[JWT]] in the header.
Each [[JSON Web Token::token]] expires.
```

The name can be the term, an alias, or an abbreviation, in any case. Add `::` and a label to show different text. Terms work in MDX only. A term inside a heading or a link fails the build.

In an `.astro` file, use the component:

```astro
---
import GlossaryTerm from 'astro-better-glossary/GlossaryTerm.astro';
---
<GlossaryTerm term="JWT" />
```

## Glossary Page

Create the page at the `path` you configured:

```mdx
import Glossary from 'astro-better-glossary/Glossary.astro';

<Glossary />
```

To render extra entry fields, allow the fields with the `fields` option and pass a function as the child. The function's output appears at the bottom of each card:

```mdx
<Glossary>{(entry) => entry.status && <StatusBadge status={entry.status} />}</Glossary>
```

Pass `listClass="not-prose"` when the page uses Tailwind Typography.

## Entry Fields

| Field | Description |
|---|---|
| `definition` | Required. One or two sentences. Inline markdown works: links, code, bold, and italics. Tooltips show link text without the link, because keyboard focus can't reach a tooltip. |
| `link` | Required. The page that explains the term. A term links to its glossary entry instead when `link` is external or points to the current page. |
| `abbreviations` | Optional array of abbreviations that also resolve to the term. |
| `aliases` | Optional array of other names that resolve to the term. |
| `standards` | Optional array of `{ name, url }` for the specifications that define the term. |

## Options

The integration and both plugins take the same options object.

| Option | Description |
|---|---|
| `file` | Required. Path to the glossary JSON, relative to the project root. |
| `path` | Required. URL of the glossary page. |
| `fields` | Extra entry fields to allow, such as `["status"]`. Any other unknown field fails the build. |
| `linkPattern` | A RegExp every `link` must match. The default allows root-relative paths and `https://` URLs. |
| `validateEntry` | `(id, entry) => message` to check extra fields. Return an error message to fail the build. |
| `help` | A line appended to every build error, such as where your docs explain glossary terms. |

## Styling

The components import `astro-better-glossary/styles.css`. Override the custom properties to match your site. The defaults use `light-dark()`, which follows the page's `color-scheme`:

```css
:root {
  --glossary-accent: light-dark(#4338ca, #818cf8);
  --glossary-tooltip-bg: light-dark(#0f172a, #334155);
}
```

To reuse the tooltip styles in other components, import the stylesheet globally.
