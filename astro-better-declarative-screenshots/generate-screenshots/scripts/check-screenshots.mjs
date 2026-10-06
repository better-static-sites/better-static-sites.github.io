#!/usr/bin/env node
// CLI: check-screenshots
// captures all screenshots and diffs them against the committed references.
// exits non-zero if any screenshot exceeds the diff threshold.
// designed for CI -- does NOT overwrite the committed files.

import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { loadConfig } from 'astro-better-declarative-screenshots';
import { discoverScreenshots } from '../src/discover.mjs';
import { startDocker, stopDocker } from '../src/docker.mjs';
import { capturePage, createBrowserContext } from '../src/capture.mjs';
import { applyChrome } from '../src/chrome.mjs';
import { diffScreenshot } from '../src/diff.mjs';

const projectRoot = process.cwd();

// default: 0.1% of pixels may differ before it's a failure
const DEFAULT_THRESHOLD_RATIO = 0.001;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig(projectRoot).catch(e => {
    console.error(e.message);
    process.exit(1);
  });

  const outputDir = path.resolve(projectRoot, config.outputDir);
  const diffDir = path.resolve(projectRoot, args.diffDir ?? '.screenshot-diffs');
  mkdirSync(diffDir, { recursive: true });

  const specs = await discoverScreenshots(projectRoot);

  if (specs.length === 0) {
    console.log('[check-screenshots] no Screenshot components found.');
    return;
  }

  const filter = args.filter;
  const toCheck = filter
    ? specs.filter(s => s.name.includes(filter) || s.url.includes(filter))
    : specs;

  console.log(`[check-screenshots] checking ${toCheck.length} screenshots...`);

  if (config.docker) {
    await startDocker(config.docker, projectRoot).catch(e => {
      console.error('[check-screenshots] docker start failed:', e.message);
      process.exit(1);
    });
  }

  // create one browser context shared across beforeAll and all captures
  const { browser, context } = await createBrowserContext({
    browser: config.browser,
    width: config.window.width,
    height: config.window.height,
    colorScheme: config.colorScheme,
  });

  if (config.beforeAll) {
    await config.beforeAll(context).catch(e => {
      console.error('[check-screenshots] beforeAll hook failed:', e.message);
      browser.close();
      process.exit(1);
    });
  }

  const failures = [];
  const missing = [];
  let passed = 0;

  for (const spec of toCheck) {
    const fullUrl = spec.url.startsWith('http')
      ? spec.url
      : `${config.baseUrl.replace(/\/$/, '')}${spec.url}`;

    const referencePath = path.join(outputDir, `${spec.name}.png`);
    process.stdout.write(`  ${spec.name} ... `);

    try {
      const rawBuffer = await capturePage({
        url: fullUrl,
        name: spec.name,
        highlights: spec.highlights,
        width: spec.width ?? config.window.width,
        height: spec.height ?? config.window.height,
        fullPage: spec.fullPage,
        browser: config.browser,
        colorScheme: config.colorScheme,
        beforeScreenshot: config.beforeScreenshot,
        context,
      });

      let newBuffer = rawBuffer;
      if (config.chrome.style !== 'none' && config.chrome.renderIn !== 'css') {
        newBuffer = await addChrome(rawBuffer, {
          url: fullUrl,
          dark: config.chrome.dark,
          showUrl: config.chrome.showUrl,
          shadowBlur: config.chrome.shadowBlur,
          shadowPadding: config.chrome.shadowPadding,
        });
      }

      const result = await diffScreenshot(referencePath, newBuffer, {
        threshold: args.pixelThreshold ?? 0.1,
        writeDiff: true,
      });

      if (result.pixels === -1) {
        // reference file was missing
        process.stdout.write('MISSING\n');
        missing.push(spec.name);
        // save the new capture as the diff artifact
        writeFileSync(path.join(diffDir, `${spec.name}.new.png`), newBuffer);
      } else if (result.ratio > (args.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO)) {
        process.stdout.write(`CHANGED (${(result.ratio * 100).toFixed(2)}% pixels differ)\n`);
        failures.push({ name: spec.name, ratio: result.ratio, pixels: result.pixels });
        if (result.diffImage) {
          writeFileSync(path.join(diffDir, `${spec.name}.diff.png`), result.diffImage);
        }
        writeFileSync(path.join(diffDir, `${spec.name}.new.png`), newBuffer);
      } else {
        process.stdout.write('ok\n');
        passed++;
      }
    } catch (e) {
      process.stdout.write(`ERROR: ${e.message}\n`);
      failures.push({ name: spec.name, ratio: 1, pixels: -1, error: e.message });
    }
  }

  if (config.afterAll) {
    await config.afterAll().catch(e => console.warn('[check-screenshots] afterAll hook failed:', e.message));
  }

  await browser.close();

  if (config.docker) {
    stopDocker(config.docker, projectRoot);
  }

  console.log(`\n[check-screenshots] ${passed} passed, ${failures.length} changed, ${missing.length} missing`);

  if (missing.length > 0) {
    console.log('\nMissing screenshots (run take-screenshots to generate):');
    for (const name of missing) console.log(`  - ${name}`);
  }

  if (failures.length > 0) {
    console.log('\nChanged screenshots (review diffs in ' + args.diffDir + '):');
    for (const f of failures) {
      if (f.error) console.log(`  - ${f.name}: error (${f.error})`);
      else console.log(`  - ${f.name}: ${(f.ratio * 100).toFixed(2)}% pixels changed`);
    }
    console.log('\nIf changes are intentional, run take-screenshots to update the reference files.');
    process.exit(1);
  }

  if (missing.length > 0 && args.failOnMissing) {
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = {
    filter: null,
    diffDir: '.screenshot-diffs',
    thresholdRatio: DEFAULT_THRESHOLD_RATIO,
    pixelThreshold: 0.1,
    failOnMissing: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fail-on-missing') args.failOnMissing = true;
    if (argv[i] === '--filter' && argv[i + 1]) args.filter = argv[++i];
    if (argv[i].startsWith('--filter=')) args.filter = argv[i].slice(9);
    if (argv[i].startsWith('--diff-dir=')) args.diffDir = argv[i].slice(11);
    if (argv[i] === '--diff-dir' && argv[i + 1]) args.diffDir = argv[++i];
    if (argv[i] === '--threshold' && argv[i + 1]) args.thresholdRatio = parseFloat(argv[++i]);
    if (argv[i].startsWith('--threshold=')) args.thresholdRatio = parseFloat(argv[i].slice(12));
  }
  return args;
}

main().catch(e => {
  console.error('[check-screenshots] fatal:', e);
  process.exit(1);
});
