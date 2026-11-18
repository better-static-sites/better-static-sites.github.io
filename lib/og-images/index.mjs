/**
 * astro-better-og-images
 *
 * Generates an Open Graph image for every page at build time: a title card
 * for pages without an image, or a 1200x630 JPEG copy of a page's own raster
 * image. Images render while Astro builds pages, are named by a hash of their
 * content, and are cached between builds.
 *
 * Usage (astro.config.ts):
 *
 *   import ogImages from 'astro-better-og-images';
 *   export default defineConfig({
 *     integrations: [ogImages({ siteName: 'Example Docs', footer: 'example.com' })],
 *   });
 *
 * Then in the page's <head>:
 *
 *   import { getOgImage } from 'astro-better-og-images/runtime';
 *   const og = await getOgImage({ title, label: 'Guides' });
 *
 * Options:
 *   route     {string}   URL prefix for generated images (default: '/og')
 *   siteName  {string}   prefix for the generated alt text
 *   wordmark  {string | {text, color}[]}  text next to the logo (default: siteName)
 *   logo      {string}   SVG markup for the logo, drawn at 64x64
 *   footer    {string}   small text at the bottom, such as the site's domain
 *   font      {string | URL}  TTF, OTF, or WOFF file (default: Inter Bold)
 *   colors    {object}   background, wordmark, label, title, footer, bar (false hides the bar)
 *   cacheDir  {string}   default: node_modules/.cache/astro-better-og-images
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRenderer, DEFAULT_FONT } from './src/render.mjs';
import { STATE_KEY } from './src/runtime.mjs';

// sharp runs on the libuv thread pool, which Astro also needs for writing pages; libuv reads the size on first use
process.env.UV_THREADPOOL_SIZE ||= String(Math.max(4, availableParallelism()));
const IN_FLIGHT = Math.max(1, Math.floor(Number(process.env.UV_THREADPOOL_SIZE) / 2));

const limiter = (max) => {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || !waiting.length) return;
    active++;
    const { task, resolve: done, reject } = waiting.shift();
    task().then(done, reject).finally(() => { active--; next(); });
  };
  return (task) => new Promise((done, reject) => { waiting.push({ task, resolve: done, reject }); next(); });
};

const fileName = (url) => url.split('/').pop();

export default function ogImages(options = {}) {
  const { route = '/og', siteName = '', cacheDir, font, ...look } = options;
  const jobs = new Map();
  let cache;
  let rendered = 0;

  return {
    name: 'astro-better-og-images',
    hooks: {
      'astro:config:setup': ({ command, config }) => {
        const root = fileURLToPath(config.root);
        const publicDir = fileURLToPath(config.publicDir);
        cache = cacheDir ? resolve(root, cacheDir) : join(root, 'node_modules/.cache/astro-better-og-images');
        const fontFile = font ? (font instanceof URL ? font : resolve(root, font)) : DEFAULT_FONT;
        const { renderCard, renderCopy } = createRenderer({ wordmark: siteName, ...look, font: fontFile });

        // any change to the template, font, or options changes every image name
        const version = createHash('sha256')
          .update(readFileSync(new URL('./src/render.mjs', import.meta.url)))
          .update(readFileSync(fontFile))
          .update(JSON.stringify({ siteName, ...look }))
          .digest('hex')
          .slice(0, 8);

        const limit = limiter(IN_FLIGHT);
        const produce = async (file, job) => {
          if (existsSync(file)) return;
          const image = job.source ? await renderCopy(job.source) : await renderCard(job);
          await writeFile(file, image);
          rendered++;
        };

        globalThis[STATE_KEY] = {
          version,
          publicDir,
          route: route.replace(/\/$/, ''),
          siteName,
          enqueue: (url, job) => {
            // the dev server never serves these, so only builds render them
            if (command !== 'build' || jobs.has(url)) return;
            jobs.set(url, limit(() => produce(join(cache, fileName(url)), job)));
          },
        };
      },
      'astro:build:start': () => mkdir(cache, { recursive: true }),
      'astro:build:done': async ({ dir, logger }) => {
        const start = performance.now();
        await Promise.all(jobs.values());
        const outDir = fileURLToPath(dir);
        await Promise.all([...jobs.keys()].map(async (url) => {
          const out = join(outDir, url);
          await mkdir(dirname(out), { recursive: true });
          await copyFile(join(cache, fileName(url)), out);
        }));
        // drop images no page uses anymore, so a CI cache doesn't grow with every renamed page
        const used = new Set([...jobs.keys()].map(fileName));
        await Promise.all((await readdir(cache)).filter(f => !used.has(f)).map(f => rm(join(cache, f))));
        const seconds = ((performance.now() - start) / 1000).toFixed(2);
        logger.info(`${jobs.size} images (${rendered} rendered, ${jobs.size - rendered} cached), ${seconds}s after the page build`);
      },
    },
  };
}
