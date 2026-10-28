# Configuration reference

All configuration lives in `screenshot.config.mjs` at your Astro project root.

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

Default color scheme for captured pages.

Default: `'light'`

Options: `'light'` | `'dark'`

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

Viewport size guardrails. Any per-screenshot `width`/`height` values are clamped to these bounds.

```js
minWindow: { width: 640, height: 400 },
maxWindow: { width: 2560, height: 1600 },
```

### `maxFullPage`

Maximum dimensions for full-page captures.

```js
maxFullPage: { width: 2560, height: 8000 }
```

---

## `chrome`

Window chrome composited over each screenshot.

```js
chrome: {
  style:         'safari-macos',  // or 'none'
  showUrl:       true,
  dark:          false,
  shadowBlur:    40,
  shadowPadding: 48,
}
```

### `chrome.style`

`'safari-macos'` renders a macOS Safari-style title bar with traffic lights and a URL bar.
`'none'` skips chrome entirely.

### `chrome.showUrl`

Whether to render the URL bar inside the chrome.

### `chrome.dark`

Use dark chrome regardless of page color scheme.

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

The specific Docker Compose service to start. If omitted, all services in the file are started.

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

---

## Hooks

Hooks are async functions that let you run code at key points in the capture lifecycle.

### `beforeAll`

Called once before any screenshots are taken. Receives a Playwright `BrowserContext`. Use this for login flows or global app state setup.

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

Called before each individual screenshot. Receives the Playwright `Page` (already navigated to the target URL) and a spec object `{ url, name, highlights }`. Use this to dismiss notifications, close modals, or set up per-page state.

```js
beforeScreenshot: async (page, { url, name }) => {
  await page.evaluate(() => {
    document.querySelectorAll('.notification').forEach(el => el.remove());
  });
},
```

### `afterScreenshot`

Called once after each screenshot attempt, after the screenshot buffer is captured (or capture fails) and before the Playwright page is closed. Receives the Playwright `Page` and the same spec object `{ url, name, highlights }` as `beforeScreenshot`. Use this hook to cleanup and remove any changes you made in beforeScreenshot, so that each screenshot is idempotent. The hook also runs when `beforeScreenshot` or capture throws, provided the page was created.


### `afterAll`

Called once after all screenshots are taken. Use for run-level cleanup.

```js
afterAll: async () => {
  console.log('done');
},
```
