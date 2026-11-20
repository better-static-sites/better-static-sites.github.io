# Configuration reference

All configuration lives in `screenshot.config.mjs` at your Astro project root.

The `<Screenshot>` component and the generator both validate `screenshot.config.mjs`. When the file is invalid, the docs build fails. When the file is missing, the component uses the defaults. Keep `astro-better-declarative-screenshots` in your Astro project at the version that `astro-better-generate-screenshots` depends on, so both packages accept the same options.

```js
export default {
  // ...
};
```

---

## Top-level options

### `baseUrl` (required)

The base URL of the running app. Screenshot URLs are resolved relative to this.

```js
baseUrl: 'http://localhost:9011'
```

### `outputDir`

Where to write screenshot PNGs, relative to the project root.

Default: `'./src/assets/screenshots'`

```js
outputDir: 'public/screenshots'
```

Note: if you store screenshots in `public/`, they are served as static files without Astro's asset pipeline. If you store them in `src/assets/`, Astro can optimize them. Pick based on whether you want image optimization.

### `browser`

Playwright browser engine.

Default: `'webkit'`

Options: `'webkit'` | `'chromium'` | `'firefox'`

WebKit gives the most accurate rendering for macOS Safari-style chrome. Use Chromium for CI environments where WebKit may not be available.

### `colorScheme`

Color scheme for captured pages. A screenshot's `colorScheme` prop overrides it.

Default: `'light'`

Options: `'light'` | `'dark'` | `'both'`

`'both'` captures each screenshot twice and writes `name.png` (light) and `name.dark.png`. The `<Screenshot>` component shows the image that matches the site's theme. With `chrome.renderIn: 'png'`, each image gets a frame in its own theme. With `'css'`, the frame follows the site's theme.

### `darkMode`

How your site shows dark mode, so `<Screenshot>` shows the matching image and window frame.

Default: `'media'`

Options:

- `'media'` -- follows `prefers-color-scheme`, unless `<html>` has `data-theme="light"` or `class="light"`.
- `'class'` -- `<html>` has `class="dark"` or `data-theme="dark"` whenever the page is dark, including when the reader follows the system setting. Use this for Tailwind's class strategy and for toggles that only add or remove a `dark` class.

### `fullPage`

Capture every screenshot at full page height. A screenshot that sets `height` or `fullPage={false}` keeps a fixed window height.

Default: `false`

### `strict`

When `true`, `<Screenshot>` throws at build time if the PNG file is missing. Defaults to the value of the `SCREENSHOTS_STRICT` environment variable.

Default: `false`

---

## `window`

Default viewport dimensions.

```js
window: { width: 1280, height: 800 }
```

Per-screenshot overrides are available via the `<Screenshot width height />` props.

### `minWindow` / `maxWindow`

Viewport size guardrails. Any per-screenshot `width`/`height` values are clamped to these bounds. A full-page capture can grow past `maxWindow.height`, up to `maxFullPage.height`. When a screenshot sets `height` above `1600`, raise `maxWindow.height`, or the capture comes out shorter than the prop asks for.

```js
minWindow: { width: 640, height: 400 },
maxWindow: { width: 2560, height: 1600 },
```

### `maxFullPage`

Maximum dimensions for full-page captures. A full-page capture grows the window until nothing is scrolled out of view, in the page or in a scrolling element that stretches with the window, such as a sidebar, and stops at `maxFullPage.height`. A screenshot's `maxHeight` prop overrides the height.

```js
maxFullPage: { width: 2560, height: 8000 }
```

---

## `chrome`

Window chrome composited over each screenshot.

```js
chrome: {
  style:         'macos',
  showUrl:       true,
  showHost:      true,
  showQuery:     true,
  showHash:      true,
  shortenIds:    false,
  theme:         'light',
  shadowBlur:    40,
  shadowPadding: 48,
}
```

### `chrome.style`

`'macos'` renders a macOS Safari-style title bar with traffic lights and a URL bar.
`'linux'` renders a GNOME-style title bar, and `'windows'` renders a Windows 11 title bar.
`'none'` skips chrome entirely.

### `chrome.showUrl`

Whether to render the URL bar inside the chrome.

### `chrome.showHost`

Set to `false` to show only the path in the URL bar. The host leaves full URLs, and `chrome.baseUrl` no longer applies to the URL bar. A screenshot's `showHost` prop overrides this setting.

### `chrome.showQuery`

Set to `false` to drop the query string from the URL bar. A screenshot's `showQuery` prop overrides this setting.

### `chrome.showHash`

Set to `false` to drop the hash from the URL bar. A screenshot's `showHash` prop overrides this setting.

### `chrome.shortenIds`

Set to `true` to shorten each UUID in the URL bar to its first 8 characters, followed by `...`. A screenshot's `shortenIds` prop overrides this setting.

### `chrome.theme`

Light or dark chrome: `'light'` or `'dark'`. A screenshot with a dark image, from `colorScheme: 'both'`, ignores this setting and matches the frame to the image shown.

### `chrome.shadowBlur`

Drop shadow blur radius in pixels. Set to `0` to disable the shadow.

### `chrome.shadowPadding`

Extra padding added around the window to accommodate the shadow. Increase this if the shadow is clipped.

---

## `docker`

Docker service configuration. The CLI boots this service before capturing screenshots and shuts it down when done.

```js
docker: {
  compose:   'docker-compose.yml',
  service:   'app',
  kickstart: 'kickstart/bootstrap.json',
  healthcheck: {
    url:      'http://localhost:9011/api/status',
    timeout:  60000,
    interval: 2000,
  },
  env: {
    DATABASE_PASSWORD: 'change-in-production',
  },
},
```

### `docker.compose`

Path to a `docker-compose.yml` file, relative to the project root. The CLI runs `docker compose -f <compose> up -d [service]`.

### `docker.service`

The Docker Compose services to start, separated by spaces. If omitted, all services in the file are started.

To start a service only when a run needs it, pass a function. The function receives the specs that the run captures or checks, after `--filter` and sharding, and returns the services to start. A function requires `astro-better-declarative-screenshots` `0.6.1` or later in your Astro project:

```js
docker: {
  compose: 'docker-compose.yml',
  // only the setup wizard screenshots use the second instance
  service: specs => specs.some(s => s.name.startsWith('setup-wizard')) ? 'app app-fresh' : 'app',
  healthcheck: { url: 'http://localhost:3000/health' },
},
```

### `docker.bootstrap`

Path to a seed/bootstrap file to pass into the container, relative to the project root. Two environment variables become available inside `docker-compose.yml`:

- `SCREENSHOT_BOOTSTRAP_PATH` -- absolute path to the file on the host
- `SCREENSHOT_BOOTSTRAP_CONTENT` -- the file's full text content

Wire these into your container however your app needs them. Examples:

**FusionAuth** (kickstart):
```yaml
environment:
  FUSIONAUTH_APP_KICKSTART_FILE: ${SCREENSHOT_BOOTSTRAP_PATH}
```

**Node.js app** (seed script via bind mount):
```yaml
volumes:
  - ${SCREENSHOT_BOOTSTRAP_PATH}:/app/seed.json:ro
```

**Generic** (pass as env var for a custom entrypoint):
```yaml
environment:
  APP_SEED_DATA: ${SCREENSHOT_BOOTSTRAP_CONTENT}
```

`kickstart` is accepted as a legacy alias for `bootstrap`.

### `docker.postStart`

Optional shell command to run after the health check passes and before `beforeAll`. Runs in the project root with the project's environment. Use for database migrations, extra seeding, or any setup that can't be bundled into the container's startup.

```js
postStart: 'node scripts/seed-extra.mjs'
// or: 'docker exec myapp-1 npm run db:migrate'
```

### `docker.healthcheck.url`

URL polled to determine when the app is ready. The CLI waits for an HTTP 200 response before proceeding.

### `docker.healthcheck.timeout`

Maximum time in milliseconds to wait for the health check. Default: `60000` (1 minute).

### `docker.healthcheck.interval`

Polling interval in milliseconds. Default: `2000`.

### `docker.env`

Extra environment variables merged into the container environment when running `docker compose up`.

In a sharded run, every shard starts its own copy of the compose project, so two shards can't publish the same host port. Compute the port from `SCREENSHOT_SHARD_INDEX`, which the CLI sets before the config loads, and pass the port to compose:

```js
const port = 9011 + 10 * Number(process.env.SCREENSHOT_SHARD_INDEX ?? 0);

export default {
  baseUrl: `http://localhost:${port}`,
  docker: {
    compose: 'docker-compose.yml',
    healthcheck: { url: `http://localhost:${port}/api/status` },
    env: { APP_PORT: String(port) },
  },
};
```

The compose file then publishes `"${APP_PORT:-9011}:9011"`.

---

## Hooks

Hooks are async functions that let you run code at key points in the capture lifecycle.

### `beforeAll`

Called once before any screenshots are taken. Receives a Playwright `BrowserContext` and `{ specs }`, the specs that the run captures or checks. `check-screenshots` passes `specs` in `0.8.4` and later. Use this for login flows or global app state setup, and use `specs` to skip setup that no screenshot in the run needs.

```js
beforeAll: async (context) => {
  const page = await context.newPage();
  await page.goto('http://localhost:9011/admin/login');
  await page.fill('#loginId', 'admin@example.com');
  await page.fill('#password', 'supersecret');
  await page.click('[type=submit]');
  await page.waitForURL('**/admin/**');
  await page.close();
},
```

### `beforeScreenshot`

Called before each individual screenshot. Receives the Playwright `Page` (already navigated to the target URL) and a spec object `{ url, name, highlights, colorScheme, timings }`. `timings` is an object only when `SCREENSHOT_TIMING=1` is set. Add `<stage>: <milliseconds>` entries to it, and the progress line prints them after the capture phases. With `colorScheme: 'both'`, the hook runs once per scheme. Use `colorScheme` to set app state that `prefers-color-scheme` doesn't control, such as a theme cookie. Use this to dismiss notifications, close modals, or set up per-page state.

```js
beforeScreenshot: async (page, { url, name }) => {
  await page.evaluate(() => {
    document.querySelectorAll('.notification').forEach(el => el.remove());
  });
},
```

### `afterScreenshot`

Called once after each screenshot attempt, after the screenshot buffer is captured (or capture fails) and before the Playwright page is closed. Receives the Playwright `Page` and the same spec object `{ url, name, highlights, colorScheme }` as `beforeScreenshot`. Use this hook to cleanup and remove any changes you made in beforeScreenshot, so that each screenshot is idempotent. The hook also runs when `beforeScreenshot` or capture throws, provided the page was created.


### `afterAll`

Called once after all screenshots are taken. Use for run-level cleanup.

```js
afterAll: async () => {
  console.log('done');
},
```
