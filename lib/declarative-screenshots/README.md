# astro-better-declarative-screenshots

Declarative, Docker-backed screenshots for Astro documentation sites. Define which pages to screenshot and which elements to highlight directly in your MDX. Screenshots are generated on demand and committed as PNG files; your docs build just renders them as `<img>` tags.

## Two packages

This repo publishes two separate npm packages:

**`astro-better-declarative-screenshots`** — Astro components for your docs site. Reads committed PNG files and renders them at build time. No Playwright, no Docker, no heavy dependencies.

**`astro-better-generate-screenshots`** — CLI that generates the PNG files. Starts Docker, captures pages with Playwright WebKit, injects highlights, composites window chrome, and writes PNGs to your output directory.

### Why separate?

Playwright and its browser binaries are large (~250 MB). Bundling them into your docs build would bloat every deploy, slow down CI, and require browser binaries on servers that only need to render already-committed PNGs.

Screenshot generation also requires a running instance of your app (via Docker), which is impractical during a normal docs build. Keeping generation in a separate package lets you run it on a schedule, on demand, or only when specific content changes — while regular docs builds stay fast and dependency-light.

The typical workflow:
- `astro-better-declarative-screenshots` is installed as a normal `dependency` of your Astro project.
- `astro-better-generate-screenshots` is installed in a `screenshots/` subdirectory (or a separate repo), invoked manually or on a CI schedule, and never touches your build pipeline.

## Installation

### Docs site (Astro project)

```sh
npm install astro-better-declarative-screenshots
```

### Screenshot generation

Install in a `screenshots/` subdirectory of your Astro project (keeps Playwright out of your main `node_modules`):

```sh
mkdir screenshots && cd screenshots
npm init -y
npm install astro-better-generate-screenshots
npx playwright install --with-deps webkit
```

Add a convenience script to your main `package.json`:

```json
{
  "scripts": {
    "screenshots": "screenshots/node_modules/.bin/take-screenshots"
  }
}
```

## Usage

### 1. Configure

Create `screenshot.config.mjs` at your Astro project root:

```js
export default {
  baseUrl: 'http://localhost:9011',
  outputDir: 'public/img/docs/screenshots',
  window: { width: 1100, height: 800 },
  browser: 'webkit',

  chrome: {
    style:    'golden-gate', // macOS-style window chrome rendered in CSS
    renderIn: 'css',
    showUrl:  true,
    theme:    'light',
  },

  docker: {
    compose:  'screenshots/docker-compose.yml',
    service:  'myapp',
    healthcheck: {
      url:     'http://localhost:9011/api/status',
      timeout: 120000,
    },
  },

  // log in once before capturing any screenshots
  beforeAll: async (context) => {
    const page = await context.newPage();
    await page.goto('http://localhost:9011/admin/login');
    await page.fill('#loginId', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/admin/);
    await page.close();
  },
};
```

### 2. Declare screenshots in MDX

Import the components at the top of any `.mdx` file:

```mdx
import Screenshot from 'astro-better-declarative-screenshots/Screenshot.astro';
import Highlight from 'astro-better-declarative-screenshots/Highlight.astro';
```

Place `<Screenshot>` where the image should appear:

```mdx
<Screenshot url="/admin/group/" alt="The groups list in the FusionAuth admin UI." />
```

Capture the full scrollable height of a page:

```mdx
<Screenshot url="/admin/user/add" alt="The add user form." fullPage={true} />
```

Crop the image to part of the page instead of the whole window:

```mdx
<Screenshot url="/admin/tenant/add" alt="The tenant name field." crop="main header:has(h1), fieldset:has(#tenant_name)">
  <Highlight selector="#tenant_name" />
</Screenshot>
```

The crop covers every element the selector matches, so a selector list like the one above keeps the page title and its buttons in view along with the field. It also grows to include any highlight borders, arrows, and labels. If the selector matches nothing, the screenshot fails rather than falling back to the full window. Give each cropped screenshot an `id` when you crop more than one part of the same page. A cropped screenshot has no window chrome around it; add `chrome={true}` to keep it.

Call out a specific element with a `<Highlight>` nested inside:

```mdx
<Screenshot url="/admin/user/manage/00000000-0000-0000-0000-100000000003"
            alt="The user registration form with the Languages field highlighted."
            fullPage={true}>
  <Highlight selector="[name*='preferredLanguages']" label="Languages" />
</Screenshot>
```

Use an arrow instead of a border, or both:

```mdx
<Screenshot url="/admin/application/" alt="The applications list.">
  <Highlight selector=".add-button" style="arrow" color="#e74c3c" label="Add" />
</Screenshot>
```

### 3. Generate PNGs

From your Astro project root:

```sh
npm run screenshots
```

This starts Docker, waits for the app to become healthy, runs `beforeAll` (e.g. log in), captures every `<Screenshot>` found in your source, and writes PNGs to `outputDir`. Existing files are overwritten.

To regenerate a single screenshot by name or URL substring:

```sh
npm run screenshots -- --filter groups
```

### 4. Commit the PNGs

Commit the generated PNG files alongside your source. The `<Screenshot>` component renders them as `<img>` tags at build time — no Playwright or Docker involved.

## Component reference

### `<Screenshot>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | URL path relative to `baseUrl`, or a full URL |
| `id` | `string` | auto-derived | Override the output filename (without `.png`) |
| `alt` | `string` | derived from filename | Alt text for the rendered `<img>` |
| `width` | `number` | `window.width` from config | Viewport width for this screenshot |
| `height` | `number` | `window.height` from config | Viewport height for this screenshot |
| `fullPage` | `boolean` | `false` | Capture the full scrollable page height |
| `crop` | `string` | — | CSS selector for the part of the page to crop the image to; covers every matching element and overrides `fullPage` |
| `cropPadding` | `number` | `16` | Pixels of space kept around the cropped area |
| `chrome` | `boolean` | `true`, `false` when cropped | Draw the window chrome around the image |

Filenames are derived from the URL path and highlight selectors:

- `/admin/group/` with no highlights → `admin-group.png`
- `/admin/group/` with `#name` highlighted → `admin-group-name.png`
- Same URL and selectors, second occurrence on the same page → `admin-group-name-1.png`

Pass an explicit `id` when the same URL appears more than once with identical highlights on the same page.

### `<Highlight>`

Nested inside `<Screenshot>`. Injects a visual overlay onto the captured page before the screenshot is taken.

| Prop | Type | Default | Description |
|---|---|---|---|
| `selector` | `string` | required | CSS selector for the element to highlight |
| `style` | `'border' \| 'arrow' \| 'both'` | `'border'` | Border around the element, arrow pointing at it, or both |
| `color` | `string` | `'#f60'` | Highlight color (any CSS color) |
| `label` | `string` | `''` | Short text badge drawn above the highlighted element |
| `borderWidth` | `number` | `3` | Border thickness in pixels |

Elements with zero dimensions (hidden inputs, `display: none` elements) are skipped automatically. If a selector matches nothing on the page, the screenshot fails instead of being saved without the highlight.

## CLI reference

Both commands are provided by `astro-better-generate-screenshots`.

### `take-screenshots`

```sh
npx take-screenshots [--filter <string>] [--strict]
```

Captures all screenshots and writes PNGs to `outputDir`.

- `--filter <string>` — only capture screenshots whose name or URL contains this string
- `--strict` — exit non-zero if any screenshot fails to capture

### `check-screenshots`

```sh
npx check-screenshots [--filter <string>] [--diff-dir <path>] [--threshold <ratio>] [--fail-on-missing]
```

Recaptures all screenshots, diffs against committed references, and exits non-zero if anything changed beyond the threshold. Useful in a scheduled CI job.

- `--filter` — only check screenshots matching this string
- `--diff-dir` — where to write diff images (default: `.screenshot-diffs`)
- `--threshold` — fraction of pixels that may differ before failure (default: `0.001` = 0.1%)
- `--fail-on-missing` — exit non-zero if any reference file is missing

## Configuration reference

All options for `screenshot.config.mjs`:

```js
export default {
  // required: base URL of the running app
  baseUrl: 'http://localhost:9011',

  // where to write PNGs, relative to the project root
  outputDir: 'public/img/docs/screenshots',

  // default viewport size
  window: { width: 1100, height: 800 },

  // viewport guardrails -- per-screenshot width/height are clamped to these
  minWindow: { width: 640,  height: 400  },
  maxWindow: { width: 2560, height: 1600 },

  // maximum dimensions for fullPage captures
  maxFullPage: { width: 2560, height: 8000 },

  // browser engine: 'webkit' | 'chromium' | 'firefox'
  // webkit gives the most accurate macOS Safari rendering
  browser: 'webkit',

  // default color scheme passed to Playwright: 'light' | 'dark'
  colorScheme: 'light',

  chrome: {
    // window frame style: 'safari-macos' | 'golden-gate' | 'linux' | 'windows' | 'none'
    // 'golden-gate' is the macOS 26 Liquid Glass-inspired style
    style: 'golden-gate',

    // 'css' renders the chrome as HTML/CSS in the Screenshot component (recommended)
    // 'png' composites the chrome into the PNG at capture time (legacy)
    renderIn: 'css',

    // whether to show the URL bar in the chrome
    showUrl: true,

    // chrome color theme: 'light' | 'dark'
    theme: 'light',

    // override the URL shown in the address bar
    // replaces the baseUrl prefix in the displayed URL
    // useful when localhost:9011 should appear as app.example.com
    baseUrl: 'https://app.example.com',

    // fixed text for the address bar, such as a host name, in place of each page's URL
    url: 'app.example.com',

    // png-only: drop shadow blur radius in pixels (0 to disable)
    shadowBlur: 40,
    // png-only: extra transparent padding around the window for the shadow
    shadowPadding: 48,
  },

  docker: {
    // path to docker-compose.yml, relative to the project root
    compose: 'screenshots/docker-compose.yml',

    // specific service to start (omit to start all services)
    service: 'myapp',

    healthcheck: {
      // URL polled until it returns HTTP 200
      url:      'http://localhost:9011/api/status',
      // max wait time in ms
      timeout:  120000,
      // polling interval in ms
      interval: 3000,
    },

    // path to a seed/bootstrap file -- exposed inside docker-compose.yml as:
    //   SCREENSHOT_BOOTSTRAP_PATH    absolute path on the host
    //   SCREENSHOT_BOOTSTRAP_CONTENT file contents as a string
    bootstrap: 'screenshots/kickstart/kickstart.json',

    // shell command to run after the health check, before beforeAll
    postStart: 'node scripts/seed.mjs',

    // extra env vars merged into the container environment
    env: {
      MY_VAR: 'value',
    },
  },

  // throw at build time if a referenced PNG is missing
  // also controlled by the SCREENSHOTS_STRICT env var
  strict: false,

  // called once before any screenshots; receives a Playwright BrowserContext
  beforeAll: async (context) => {
    // typical use: log in so all subsequent pages load authenticated
    const page = await context.newPage();
    await page.goto('http://localhost:9011/admin/login');
    await page.fill('#loginId', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/admin/);
    await page.close();
  },

  // called before each individual screenshot; receives the Playwright Page
  // (already navigated to the target URL) and { url, name, highlights }
  beforeScreenshot: async (page, { url }) => {
    // typical use: dismiss transient UI (notifications, focus rings, etc.)
    await page.evaluate(() => {
      document.querySelectorAll('.notification, [role=alert]').forEach(el => el.remove());
      document.activeElement?.blur();
    });
  },

  // called after each capture attempt, before its page closes, to undo changes to FusionAuth before the next screenshot runs
  afterScreenshot: async (page, { name }) => {
    // restore any backend state changed for this screenshot
  },

  // called once after all screenshots are taken
  afterAll: async () => {},
};
```

## Environment variables

- `SCREENSHOTS_STRICT=true` — `<Screenshot>` throws at build time when the PNG is missing, instead of rendering a placeholder
- `SCREENSHOTS_DIR` — override `outputDir` without changing the config file

## License

MIT
