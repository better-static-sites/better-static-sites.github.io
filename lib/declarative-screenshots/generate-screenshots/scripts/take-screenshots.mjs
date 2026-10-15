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
import { generatePlaceholder } from '../src/placeholder.mjs';

const projectRoot = process.cwd();

async function main() {
  const args = parseArgs(process.argv.slice(2));
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

  const filter = args.filter;
  const toCapture = filter
    ? specs.filter(s => s.name.includes(filter) || s.url.includes(filter))
    : specs;

  console.log(`[screenshots] found ${specs.length} screenshots, capturing ${toCapture.length}`);

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

  const { browser, context } = await createBrowserContext({
    browser: config.browser,
    width: config.window.width,
    height: config.window.height,
    colorScheme: config.colorScheme,
    wsEndpoint: container?.wsEndpoint,
  });

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

  for (const spec of toCapture) {
    const fullUrl = spec.url.startsWith('http')
      ? spec.url
      : `${config.baseUrl.replace(/\/$/, '')}${spec.url}`;

    const outputPath = path.join(outputDir, `${spec.name}.png`);
    process.stdout.write(`  [${++captured}/${toCapture.length}] ${spec.name} ... `);

    try {
      const rawBuffer = await capturePage({
        url: fullUrl,
        name: spec.name,
        highlights: spec.highlights,
        width: spec.width ?? config.window.width,
        height: spec.height ?? config.window.height,
        fullPage: spec.fullPage,
        crop: spec.crop,
        cropPadding: spec.cropPadding,
        browser: config.browser,
        colorScheme: config.colorScheme,
        beforeScreenshot: config.beforeScreenshot,
        context,
      });

      const finalBuffer = await applyChrome(rawBuffer, config, fullUrl, spec.chrome);

      writeFileSync(outputPath, finalBuffer);
      process.stdout.write('done\n');
    } catch (e) {
      process.stdout.write(`FAILED: ${e.message}\n`);
      errors.push({ spec, error: e });

      if (args.strict || config.strict) {
        // write a placeholder so the build doesn't break
        try {
          const placeholder = await generatePlaceholder({
            name: spec.name,
            width: spec.width ?? config.window.width,
            height: spec.height ?? config.window.height,
          });
          writeFileSync(outputPath, placeholder);
        } catch {}
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
    for (const { spec, error } of errors) {
      console.error(`  - ${spec.name}: ${error.message}`);
    }
    if (args.strict) process.exit(1);
  } else {
    console.log(`\n[screenshots] all ${captured} screenshots saved to ${config.outputDir}`);
  }
}

function parseArgs(argv) {
  const args = { strict: false, filter: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--strict') args.strict = true;
    if (argv[i] === '--filter' && argv[i + 1]) args.filter = argv[++i];
    if (argv[i].startsWith('--filter=')) args.filter = argv[i].slice(9);
  }
  return args;
}

main().catch(e => {
  console.error('[screenshots] fatal:', e);
  process.exit(1);
});
