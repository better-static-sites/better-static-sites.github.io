import { z } from 'zod';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';

const WindowSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const DockerSchema = z.object({
  // path to a docker-compose file
  compose: z.string().optional(),
  // specific service to start (omit to start all services in the compose file)
  service: z.string().optional(),
  // health check URL -- polled until 200 or timeout
  healthcheck: z.object({
    url: z.string().url(),
    timeout: z.number().int().positive().default(60000),
    interval: z.number().int().positive().default(2000),
  }),
  // path to a bootstrap/seed file to pass into the container.
  // exposed to docker-compose.yml as env vars SCREENSHOT_BOOTSTRAP_PATH and
  // SCREENSHOT_BOOTSTRAP_CONTENT. wire these into your container however it needs
  // (e.g. FUSIONAUTH_APP_KICKSTART_FILE=SCREENSHOT_BOOTSTRAP_PATH for FusionAuth,
  //  or mount the path as a volume for other apps).
  bootstrap: z.string().optional(),
  // legacy alias for bootstrap -- 'kickstart' still works
  kickstart: z.string().optional(),
  // shell command to run after the health check passes and before beforeAll.
  // runs in the project root. useful for database migrations, seed scripts, etc.
  // example: 'node scripts/seed.js' or 'docker exec app npm run db:seed'
  postStart: z.string().optional(),
  // arbitrary env vars merged into the container environment when running compose up
  env: z.record(z.string()).optional(),
});

const ChromeSchema = z.object({
  // chrome style: 'safari-macos' (classic pre-2026), 'golden-gate' (macOS 26 Liquid Glass), 'none'
  style: z.enum(['safari-macos', 'golden-gate', 'linux', 'windows', 'none']).default('safari-macos'),
  // 'css' renders the window frame in HTML/CSS in the Screenshot component (recommended);
  // 'png' composites the chrome into the image at capture time (legacy)
  renderIn: z.enum(['css', 'png']).default('png'),
  // show the URL bar in the chrome
  showUrl: z.boolean().default(true),
  // light or dark chrome (title bar)
  theme: z.enum(['light', 'dark']).default('light'),
  // override the URL shown in the address bar (e.g. a public hostname instead of localhost)
  // replaces the config-level baseUrl prefix in the displayed URL
  baseUrl: z.string().url().optional(),
  // fixed text for the address bar on every screenshot, such as a host name
  url: z.string().optional(),
  // png-only: drop shadow radius in pixels; 0 to disable
  shadowBlur: z.number().int().min(0).default(40),
  // png-only: extra padding around the window to make room for the shadow
  shadowPadding: z.number().int().min(0).default(48),
});

const ConfigSchema = z.object({
  // base URL of the running app
  baseUrl: z.string().url(),

  // where to write screenshot PNGs -- relative to the project root
  outputDir: z.string().default('./src/assets/screenshots'),

  // default window dimensions
  window: WindowSizeSchema.default({ width: 1280, height: 800 }),

  // minimum and maximum window dimensions enforced globally
  minWindow: WindowSizeSchema.default({ width: 640, height: 400 }),
  maxWindow: WindowSizeSchema.default({ width: 2560, height: 1600 }),

  // maximum dimensions for full-page captures
  maxFullPage: WindowSizeSchema.default({ width: 2560, height: 8000 }),

  // window chrome style
  chrome: ChromeSchema.default({}),

  // browser engine -- webkit gives the most Safari-accurate render
  browser: z.enum(['webkit', 'chromium', 'firefox']).default('webkit'),

  // default color scheme
  colorScheme: z.enum(['light', 'dark']).default('light'),

  // pinned linux browser container so text renders the same on every os; true = bundled image, { image } = your own
  browserContainer: z.union([
    z.boolean(),
    z.object({ image: z.string().min(1).optional() }),
  ]).default(false),

  // docker service configuration -- optional when the app is already running
  docker: DockerSchema.optional(),

  // strict mode -- fail the build when a screenshot file is missing
  // defaults to true when SCREENSHOTS_STRICT=true env var is set
  strict: z.boolean().default(process.env.SCREENSHOTS_STRICT === 'true'),

  // called once before all screenshots are taken (good for login flows)
  beforeAll: z.function().optional(),

  // called before each individual screenshot
  beforeScreenshot: z.function().optional(),

  // called after each individual screenshot, including when capture setup or capture fails
  afterScreenshot: z.function().optional(),

  // called once after all screenshots are taken
  afterAll: z.function().optional(),
});

export async function loadConfig(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'screenshot.config.mjs'),
    path.join(projectRoot, 'screenshot.config.js'),
  ];

  const configPath = candidates.find(existsSync);
  if (!configPath) {
    throw new Error(
      `No screenshot.config.mjs found in ${projectRoot}. ` +
      `Create one -- see the README for the full config reference.`
    );
  }

  const raw = await import(/* @vite-ignore */ pathToFileURL(configPath).href);
  const config = raw.default ?? raw;

  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`screenshot.config.mjs is invalid:\n${issues}`);
  }

  return result.data;
}

export { ConfigSchema, DockerSchema };
