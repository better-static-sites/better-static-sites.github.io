# Contributing to Better Static Sites

This guide applies to everyone who writes code or docs for the `astro-better-*` packages and the docs site (agents too). For installing, building, generating screenshots, and releasing, see the [README](README.md).

## Write for the Reader

Readers come to the docs to add a package to their site and get the package working. Every rule below serves that goal.

* Address the reader as "you". Write steps in the imperative: "Add the integration to `astro.config.ts`," not "The user should add the integration."
* Keep sentences short, with one idea per sentence. Split a sentence that chains clauses with "and", "which", or a semicolon.
* Lead with a condition that decides whether the reader acts. Write "When your site uses a base path, set **`base`**," not "Set **`base`** when your site uses a base path." A reader can then skip a step that doesn't apply. Keep a timing condition at the end when the step applies to every reader: "Commit the PNGs when the run finishes."
* Use active voice. Write "The integration writes `dist/llms.txt`," not "`dist/llms.txt` is written."
* Repeat the noun instead of using a pronoun. Write "The component renders a `<details>` element," not "It renders a `<details>` element." Avoid "it", "they", "this", and "these" as subjects, even when the noun is long.
* Say what happens. Skip filler such as "simply", "just", "easily", "basically", and "note that".
* State limits and requirements plainly, including the minimum Node.js, Astro, or peer dependency version.
* Use plain ASCII: straight quotes, straight apostrophes, and no smart punctuation.
* Use the Oxford comma: "apples, bananas, and oranges".

### Avoid AI Writing Patterns

Readers notice these patterns, and the patterns make a page read as generated. Do not use the following:

* Em dashes or en dashes. Use a comma, a period, a colon, or parentheses, or (preferred) restructure the sentence.
* "It's not X, it's Y", "not just X, but Y", and other contrast setups.
* Lists of three when one example makes the point.
* Hype words: "seamless", "robust", "powerful", "leverage", "unlock", "empower", "game-changing", "cutting-edge". Avoid adjectives unless the adjective changes the meaning of the phrase.
* Stock phrases: "dive into", "delve", "at its core", "let's unpack", "in today's world", "whether you're X or Y", "it's worth noting", "load-bearing".
* Openings that restate the title, and closings that summarize the page or say "Congratulations" or "Happy coding".
* Bold or italics for emphasis. Bold marks option and prop names only (see [Code and UI Elements](#code-and-ui-elements)).
* Emoji.

## Structure Pages

### Give Each Page One Job

Decide what kind of page you're writing, and keep the page to that job. Link to other pages instead of mixing types.

* A package page documents one package. Start with a short paragraph about what the package does, then `<PkgMeta>`, then Installation, Setup or Usage, a live example, and the options or props reference. Keep each section to that order so readers find the same thing in the same place on every package page.
* A how-to section gets the reader through one task, such as consistent rendering across operating systems. Start with the goal, then give the steps, then show how to confirm the result.
* A reference section lists facts to look up, such as options, props, or exit codes. Keep reference terse and complete, usually as a table.
* A section overview is a folder `index.mdx` that names and orders a sidebar group. Set `route: false` when the folder needs no page of its own.

### Put the Page Where Readers Look

The sidebar comes from the folders in `src/content`. Put each package page in the folder a reader would open:

* `content` holds components you place in MDX, such as admonitions, cards, and tabs.
* `layout` holds site chrome, such as the nav bar, sidebar, and table of contents.
* `build-tools` holds integrations and plugins that run at build time, such as Mermaid rendering and the link checker.
* `releases` holds release notes for the docs site and the package family.

Name a package page after the `lib/` folder of the package: `lib/mermaid/` documents at `src/content/build-tools/mermaid.mdx`. When a `lib/` folder holds two packages, document both on one page, or give the advanced package a page of its own next to the basic one (`code-blocks.mdx` and `code-snippet-extractor.mdx`).

## Formatting

### Front Matter

The schema lives in `src/content.config.ts`. `title` is required. Common optional fields:

| Field | Notes |
|---|---|
| `description` | One sentence for search results, cards, and `llms.txt`. See [Descriptions](#descriptions). |
| `order` | Sort position in the sidebar. Lower numbers sort first. |
| `version`, `versions` | The published version of the package, shown by `<PkgMeta>`. Use `versions` with a key per package when a page documents more than one package. |
| `badges` | Package kinds shown on cards: `component`, `integration`, or `tool`. |
| `route` | Set to `false` on a folder `index.mdx` that only names and orders a sidebar group. |
| `sidebar` | `label` overrides the sidebar text. `folderBehavior` sets how a folder entry behaves: `page`, `unclickable`, or `overview`. |
| `hidden`, `excludeFromNav` | Hide the page from the sidebar, or from card grids and page navigation. The page still builds. |
| `prev`, `next` | Override the previous and next page links. |

Bump `version` or `versions` whenever you publish a new version of the package. A stale version tells the reader to install the wrong release.

### Titles and Headings

* Write `title` and every heading in title case, with no ending punctuation: `Consistent Rendering Across Operating Systems`.
* Keep `title` short, because the sidebar and cards already show the folder: `Admonitions`, not `Admonitions Component for Astro`.
* Start sections at `##`, because the title renders as the only `h1`.
* Don't wrap long lines by hand. Use your editor's soft wrap.

### Descriptions

Write `description` as one full sentence that ends with a period. Name what the package does in the reader's words: "Learn how to render Mermaid diagrams to inline SVG at build time." Don't start with "An overview of" or "This page", and don't repeat the title word for word.

### Lists

* Use an ordered list only when order matters, such as steps. Use an unordered list for options, prerequisites, and features.
* Number every ordered item `1.`, and the renderer fills in the real numbers. Start unordered items with `*`.
* Introduce a list with a sentence that ends in a colon.
* Don't count the items in a list introduction. Write "the following options", not "three options", because the count drifts when someone edits the list.
* Keep items parallel: all full sentences or all fragments, starting the same way.
* End an item with a period when the item is a sentence.

```plaintext
To make a smoothie:

1. Put milk and a banana in a blender.
1. Run the blender for 30 seconds.
```

For multi-step setup with a heading per step, wrap the steps in `<Steps>` from `astro-better-steps`, with a `###` heading for each step.

### Code and UI Elements

* Option names, prop names, and literal keys in code or config use **`bold monospace`**: ``Set **`titleFix`** to `true`.``
* Values use `monospace`: ``Set **`display`** to `inline`.``
* Package names, filenames, paths, commands, components, and versions use `monospace`: `astro-better-refs`, `astro.config.ts`, `<Ref>`, `0.2.1`.
* Field labels in a UI use **bold**: `Click **Save**.`
* Introduce a code block with a sentence that ends in a colon or a period.

### Code Examples

* Use `shell-session` for commands the reader runs. Write the commands without a `$` prompt, because `remarkShellSession` adds the prompt.
* Give a code block a `title` when the code belongs in a specific file: ```` ```ts title="astro.config.ts" ````.
* Use `mdx escape` or `astro escape` when the example shows component markup that the page should display instead of render.
* Highlight the lines that matter with `{2,6-8}`, and show changes with `diff`. For the full syntax, see [Code Blocks](/build-tools/code-blocks).
* Show the smallest working example first. Put options and variations after the reader has something running.
* Follow a usage example with a live example when the package renders something visible, so the reader sees the output.

### Links

* Link to other docs pages with a root-relative path and no trailing slash: `[Steps](/content/steps)`. Don't use the domain or a relative path such as `./steps`.
* Link to a spot that might move with a named anchor: `[heading suffix](ref:section-heading-suffix)`. For more information, see [Anchor References](/build-tools/refs).
* Make link text describe the destination. Write "see [Tabs](/content/tabs)", not "click [here](...)".
* Describe the subject first, and put the link in a separate sentence at the end: "For more information, see [Tabs](/content/tabs)." Don't write "See X for the options."

### Admonitions

Use admonitions sparingly, for information that doesn't fit the flow of the page. Import `Admonition` from `astro-better-admonitions`, and choose the type by the cost of missing the information:

* `note` for useful context.
* `tip` for a shortcut or a better way to do something.
* `caution` for something that can stop a task from working.
* `danger` for something that can lose data or break a site.

An admonition `title` can use inline markdown, such as ``title="The `latest` tag is not dynamic"``.

### Diagrams

Add a diagram whenever a subject takes more than a short paragraph to explain: a build pipeline, a decision with several branches, or how packages relate to each other. Write diagrams as Mermaid code blocks, not as images, so anyone can edit them. `astro-better-mermaid` renders the diagrams to SVG at build time:

````plaintext
```mermaid title="The screenshot CLI builds the site, starts Docker, and writes PNGs."
graph LR
    Build[astro build] --> Docker[docker compose up]
    Docker --> Capture[Playwright capture]
    Capture --> PNG[public/img/screenshots]
```
````

* Use `sequenceDiagram` for requests between systems, and `graph` or `flowchart` for decisions, relationships, and pipelines.
* Give every diagram a `title` that describes the diagram in a full sentence.
* Keep each diagram to one idea. Split a diagram that needs a legend to read.
* Explain the diagram in the surrounding text, because some readers can't see the diagram.

### Images

* Prefer generated screenshots from `<Screenshot>` in `astro-better-declarative-screenshots`. Run `npm run screenshots` to capture the screenshots, and commit the PNGs. For setup, see the [README](README.md#screenshots).
* Add a screenshot only when the screenshot shows something the text and the live example can't. Every image adds to the page size.
* Give every image alt text that describes the content in a full sentence.
* Place an image after the text that describes the image.
* Use SVG when possible, or a minified PNG. Put static images in `public/`. Use WEBM instead of GIF: `ffmpeg -i demo.gif demo.webm`.

## Components and Imports

The docs site imports nothing automatically. Import every component after the front matter, by package name for library components and by the full path from `src` for site components:

```jsx
import { Admonition } from 'astro-better-admonitions';
import PkgMeta from 'src/components/PkgMeta.astro';
```

Use the published package in the docs site. To test a local change to a package, point the dependency at the `lib/` folder or use `npm link`, and don't commit the local reference.

## Package Docs

Each package has up to three docs, and each doc serves a different reader:

* The package `README.md` is the page on npm and in the standalone mirror repo. The reader may never see the docs site, so cover installation, basic usage, and the full props or options table. Use absolute links (`https://better-static-sites.github.io/content/admonitions`), because relative links to the rest of this repo break on npm and in the mirror.
* An extra reference file, such as `CONFIGURATION.md`, holds detail too long for the README. Link to the file from the README.
* The docs page in `src/content` teaches the package with live examples. The docs page can link to the README for exhaustive reference instead of repeating every option.

When you change a package, update all three docs in the same change. Add every new option, prop, flag, and exit code to the README table and to the docs page. Remove anything the change removes. Bump the package version in `package.json` and in the docs page front matter. Add a release note in `src/content/releases` when the change affects readers.

## Code

* Write code that reads like the surrounding code. Match the comment density, naming, and idioms of the file.
* Keep comments to one line, and only where the code can't explain the situation.
* Write error messages for the maintainer who reads the error in a CI log. Say what failed, what the code expected, and what the code found instead.
* Add a test in the package's `test/` folder when you fix a bug or add an option to a package that has tests. The declarative screenshots packages keep tests in `tests/` instead. Run the tests with `npm test` from the folder whose `package.json` defines the `test` script, such as `lib/refs` or `lib/declarative-screenshots`.
* Prefer the simplest change that works. A new dependency, config option, or moving part needs a reason the reader of the change can see.
