#!/usr/bin/env node
// CLI: take-screenshots
// discovers Screenshot components in the project, starts Docker, captures
// each page via Playwright, composites chrome, and writes PNGs to outputDir.

import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { loadConfig } from 'astro-better-declarative-screenshots';
import { discoverScreenshots } from '../src/discover.mjs';
import { startDocker, stopDocker } from '../src/docker.mjs';
import { capturePage, createBrowserContext } from '../src/capture.mjs';
import { startBrowserContainer } from '../src/browser-container.mjs';
import { applyChrome } from '../src/chrome.mjs';
import { resolveCaptures } from '../src/resolve.mjs';
import { generatePlaceholder } from '../src/placeholder.mjs';
import { parseShard, specsForShard, runShards } from '../src/shard.mjs';
import { fileURLToPath } from 'url';

const projectRoot = process.cwd();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.shards > 1) process.exit(await runShards(fileURLToPath(import.meta.url), args.passthrough, args.shards));
  // set before the config loads, so the config can give each shard its own ports
  if (args.shard) {
    process.env.SCREENSHOT_SHARD_INDEX = String(args.shard.index);
    process.env.SCREENSHOT_SHARD_COUNT = String(args.shard.count);
  }
  const config = await loadConfig(projectRoot).catch(e => {
    console.error(e.message);
    process.exit(1);
  });

  const outputDir = path.resolve(projectRoot, config.outputDir);
  mkdirSync(outputDir, { recursive: true });

  // discover all Screenshot components in the source
  console.log(`[screenshots] scanning ${projectRoot} for Screenshot components...`);
  const specs = await discoverScreenshots(projectRoot);

  if (specs.length === 0) {
    console.log('[screenshots] no Screenshot components found.');
    return;
  }

  let toCapture = getScreenshotsToCapture(args, specs);
  if (args.shard) {
    toCapture = specsForShard(toCapture, args.shard, spec => resolveCaptures(spec, config).length);
    console.log(`[screenshots] shard ${args.shard.index + 1}/${args.shard.count} takes ${toCapture.length} of them`);
    if (toCapture.length === 0) return;
    if (config.docker?.compose) {
      // compose names a project after the compose file's folder, so shards would share containers
      const folder = path.basename(path.dirname(path.resolve(projectRoot, config.docker.compose))).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      process.env.COMPOSE_PROJECT_NAME = `${process.env.COMPOSE_PROJECT_NAME ?? folder}-shard-${args.shard.index + 1}`;
    }
  }

  // start Docker if configured
  if (config.docker) {
    await startDocker(config.docker, projectRoot).catch(e => {
      console.error('[screenshots] docker start failed:', e.message);
      process.exit(1);
    });
  }

  // create one browser context shared across beforeAll and all captures so
  // session cookies from login are preserved throughout
  // a pinned browser container makes text render the same on every host os
  const container = config.browserContainer
    ? await startBrowserContainer(config.browserContainer).catch(e => {
        console.error('[screenshots] browser container failed:', e.message);
        process.exit(1);
      })
    : null;

  const { browser, context: initialContext } = await createBrowserContext({
    browser: config.browser,
    width: config.window.width,
    height: config.window.height,
    colorScheme: config.colorScheme === 'dark' ? 'dark' : 'light',
    wsEndpoint: container?.wsEndpoint,
  });
  let context = initialContext;

  if (config.beforeAll) {
    console.log('[screenshots] running beforeAll hook');
    await config.beforeAll(context).catch(e => {
      console.error('[screenshots] beforeAll hook failed:', e.message);
      browser.close();
      process.exit(1);
    });
  }

  const errors = [];
  let captured = 0;
  const total = toCapture.reduce((sum, spec) => sum + resolveCaptures(spec, config).length, 0);

  for (const spec of toCapture) {
    const fullUrl = spec.url.startsWith('http')
      ? spec.url
      : `${config.baseUrl.replace(/\/$/, '')}${spec.url}`;

    for (const capture of resolveCaptures(spec, config)) {
      const outputPath = path.join(outputDir, `${capture.name}.png`);
      process.stdout.write(`  [${++captured}/${total}] ${capture.name} ... `);

      try {
        if (spec.clearBrowserBeforeCapture) {
          context = await clearBrowserContext(browser, context, config);
        }

        const rawBuffer = await capturePage({
          url: fullUrl,
          name: spec.name,
          highlights: spec.highlights,
          width: capture.width,
          height: capture.height,
          fullPage: capture.fullPage,
          maxHeight: capture.maxHeight,
          crop: spec.crop,
          cropPadding: spec.cropPadding,
          browser: config.browser,
          colorScheme: capture.colorScheme,
          beforeScreenshot: config.beforeScreenshot,
          afterScreenshot: config.afterScreenshot,
          context,
        });

        const finalBuffer = await applyChrome(rawBuffer, config, fullUrl, spec.chrome, capture.chromeTheme, spec);

        writeFileSync(outputPath, finalBuffer);
        process.stdout.write('done\n');
      } catch (e) {
        process.stdout.write(`FAILED: ${e.message}\n`);
        errors.push({ name: capture.name, error: e });

        if (args.strict || config.strict) {
          // write a placeholder so the build doesn't break
          try {
            const placeholder = await generatePlaceholder({
              name: capture.name,
              width: capture.width,
              height: capture.height,
            });
            writeFileSync(outputPath, placeholder);
          } catch {}
        }
      }
    }
  }

  if (config.afterAll) {
    await config.afterAll().catch(e => {
      console.warn('[screenshots] afterAll hook failed:', e.message);
    });
  }

  await browser.close();
  container?.stop();

  if (config.docker) {
    stopDocker(config.docker, projectRoot);
  }

  if (errors.length > 0) {
    console.error(`\n[screenshots] ${errors.length} screenshot(s) failed:`);
    for (const { name, error } of errors) {
      console.error(`  - ${name}: ${error.message}`);
    }
    if (args.strict) process.exit(1);
  } else {
    console.log(`\n[screenshots] all ${captured} screenshots saved to ${config.outputDir}`);
  }
}

async function clearBrowserContext(browser, context, config) {
  const nextContext = await browser.newContext({
    viewport: { width: config.window.width, height: config.window.height },
    colorScheme: config.colorScheme === 'dark' ? 'dark' : 'light',
    deviceScaleFactor: 2,
  });
  await context.close();
  return nextContext;
}

function parseArgs(argv) {
  const args = { strict: false, filter: null, shards: 1, shard: null, passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    let value;
    if (argv[i] === '--shards' || argv[i].startsWith('--shards=')) {
      value = argv[i].startsWith('--shards=') ? argv[i].slice(9) : argv[++i];
      args.shards = Number(value);
      if (!Number.isInteger(args.shards) || args.shards < 1) {
        console.error(`--shards takes a whole number of 1 or more, got: ${value}`);
        process.exit(1);
      }
      continue;
    }
    args.passthrough.push(argv[i]);
    if (argv[i] === '--strict') args.strict = true;
    if (argv[i] === '--filter' && argv[i + 1]) args.passthrough.push(args.filter = argv[++i]);
    if (argv[i].startsWith('--filter=')) args.filter = argv[i].slice(9);
    if (argv[i] === '--shard' || argv[i].startsWith('--shard=')) {
      if (argv[i] === '--shard') args.passthrough.push(argv[i + 1]);
      value = argv[i].startsWith('--shard=') ? argv[i].slice(8) : argv[++i];
      try { args.shard = parseShard(value); } catch (e) { console.error(e.message); process.exit(1); }
    }
  }
  if (args.shards > 1 && args.shard) {
    console.error('use --shards or --shard, not both');
    process.exit(1);
  }
  return args;
}

function getScreenshotsToCapture(args, specs) {
  const filter = args.filter;
  const matchingSpecs = filter ? specs.filter(s => s.name.includes(filter) || s.url.includes(filter)) : specs;
  const duplicateImageIds = new Set();
  const toCapture = matchingSpecs.filter(spec => {
    if (duplicateImageIds.has(spec.name)) return false;
    duplicateImageIds.add(spec.name);
    return true;
  });
  const duplicatesSkipped = matchingSpecs.length - toCapture.length;
  const duplicateNote = duplicatesSkipped ? ` (${duplicatesSkipped} duplicate IDs skipped)` : '';
  console.log(`[screenshots] found ${specs.length} screenshots, capturing ${toCapture.length}${duplicateNote}`);
  return toCapture;
}

main().catch(e => {
  console.error('[screenshots] fatal:', e);
  process.exit(1);
});
