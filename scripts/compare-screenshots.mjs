#!/usr/bin/env node
/**
 * Compares two directories of screenshots with a tolerance, so that rendering noise
 * does not read as a real change.
 *
 * The weekly refresh used to decide with `git diff`, which is a byte comparison: a
 * single antialiased pixel counted the same as a redesigned page, and PNG encoding
 * alone can change the bytes without changing the image. This diffs pixels instead,
 * via the same pixelmatch engine the screenshot tooling already uses, and only
 * reports images whose differing-pixel ratio exceeds a threshold.
 *
 * Usage:
 *   scripts/compare-screenshots.mjs --baseline <dir> [--candidate <dir>]
 *   scripts/compare-screenshots.mjs --baseline /tmp/before --threshold 0.005
 *   scripts/compare-screenshots.mjs --baseline /tmp/before --revert-within-tolerance
 *
 * Options:
 *   --baseline <dir>            Reference images. Required.
 *   --candidate <dir>           Images to test. Default public/img/screenshots.
 *   --threshold <ratio>         Differing-pixel ratio that counts as a real change.
 *                               Default 0.02, so an image at least 98% identical passes.
 *   --pixel-threshold <0..1>    Per-pixel colour sensitivity passed to pixelmatch.
 *                               Default 0.1. Lower is stricter.
 *   --revert-within-tolerance   Copy the baseline back over any candidate that is
 *                               within tolerance, so only meaningful changes remain
 *                               in the working tree.
 *   --out <dir>                 Write a diff image per failing comparison.
 *   --json                      Emit machine-readable results.
 *
 * Exit codes:
 *   0  every image is within tolerance (and no images were added, removed, or resized)
 *   1  at least one image changed beyond the threshold, or was added, removed, or resized
 *   2  bad usage
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

// pixelmatch, pngjs and sharp are installed for the screenshot CLI rather than the
// site, so resolve them from there instead of adding duplicate dependencies.
const CLI_DIR = join(REPO_ROOT, 'screenshots');
const requireFromCli = createRequire(join(CLI_DIR, 'package.json'));
let PNG, pixelmatch, sharp;
try {
  // pixelmatch is ESM-only, so resolve each path then import it; `require` would
  // hand back the module namespace instead of the function.
  const load = async name => {
    const mod = await import(pathToFileURL(requireFromCli.resolve(name)).href);
    return mod.default ?? mod;
  };
  PNG = (await load('pngjs')).PNG ?? (await load('pngjs'));
  pixelmatch = await load('pixelmatch');
  sharp = await load('sharp');
} catch (err) {
  console.error(`Could not load the image libraries from ${CLI_DIR}: ${err.message}`);
  console.error('Run `npm ci` in screenshots first.');
  process.exit(2);
}

const argv = process.argv.slice(2);
const flag = name => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const has = name => argv.includes(name);

if (has('--help') || has('-h')) {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).replace(/^\s*\* ?/gm, '').trim());
  process.exit(0);
}

const BASELINE = flag('--baseline');
const CANDIDATE = flag('--candidate') ?? join(REPO_ROOT, 'public', 'img', 'screenshots');
const THRESHOLD = Number(flag('--threshold') ?? 0.02);
const PIXEL_THRESHOLD = Number(flag('--pixel-threshold') ?? 0.1);
const OUT = flag('--out');
const REVERT = has('--revert-within-tolerance');
const JSON_OUT = has('--json');

if (!BASELINE) {
  console.error('--baseline <dir> is required.');
  process.exit(2);
}
for (const [label, dir] of [['baseline', BASELINE], ['candidate', CANDIDATE]]) {
  if (!existsSync(dir)) {
    console.error(`${label} directory does not exist: ${dir}`);
    process.exit(2);
  }
}
if (OUT) mkdirSync(OUT, { recursive: true });

const pngs = dir => readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).sort();
const baselineFiles = pngs(BASELINE);
const candidateFiles = pngs(CANDIDATE);

/** Pad both images to a common size so a resize alone does not mask a diff. */
async function toRaw(buffer, width, height) {
  const meta = await sharp(buffer).metadata();
  return sharp(buffer)
    .extend({
      top: 0,
      left: 0,
      bottom: Math.max(0, height - meta.height),
      right: Math.max(0, width - meta.width),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .ensureAlpha()
    .toBuffer();
}

async function compare(name) {
  const aBuf = readFileSync(join(BASELINE, name));
  const bBuf = readFileSync(join(CANDIDATE, name));

  if (aBuf.equals(bBuf)) return { name, ratio: 0, pixels: 0, identical: true };

  const [aMeta, bMeta] = await Promise.all([sharp(aBuf).metadata(), sharp(bBuf).metadata()]);
  const width = Math.max(aMeta.width, bMeta.width);
  const height = Math.max(aMeta.height, bMeta.height);

  const [aRaw, bRaw] = await Promise.all([toRaw(aBuf, width, height), toRaw(bBuf, width, height)]);
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(aRaw, bRaw, diff.data, width, height, { threshold: PIXEL_THRESHOLD });
  const ratio = pixels / (width * height);

  const resized = aMeta.width !== bMeta.width || aMeta.height !== bMeta.height;
  if (OUT && (resized || ratio > THRESHOLD)) writeFileSync(join(OUT, name), PNG.sync.write(diff));

  return { name, ratio, pixels, identical: false, resized,
           baselineSize: `${aMeta.width}x${aMeta.height}`, candidateSize: `${bMeta.width}x${bMeta.height}` };
}

const added = candidateFiles.filter(f => !baselineFiles.includes(f));
const removed = baselineFiles.filter(f => !candidateFiles.includes(f));
const common = baselineFiles.filter(f => candidateFiles.includes(f));

const results = [];
for (const name of common) results.push(await compare(name));

const identical = results.filter(r => r.identical);
// padding blends to white in pixelmatch, so a light page that grew can score near 0%
const isChanged = r => !r.identical && (r.resized || r.ratio > THRESHOLD);
const withinTolerance = results.filter(r => !r.identical && !isChanged(r));
const changed = results.filter(isChanged);

if (REVERT) {
  for (const r of withinTolerance) copyFileSync(join(BASELINE, r.name), join(CANDIDATE, r.name));
}

if (JSON_OUT) {
  console.log(JSON.stringify({ threshold: THRESHOLD, pixelThreshold: PIXEL_THRESHOLD,
    identical: identical.map(r => r.name), withinTolerance, changed, added, removed }, null, 2));
} else {
  console.log(`Comparing ${common.length} image(s)`);
  console.log(`  baseline:  ${BASELINE}`);
  console.log(`  candidate: ${CANDIDATE}`);
  console.log(`  tolerance: ${(THRESHOLD * 100).toFixed(3)}% of pixels, pixel sensitivity ${PIXEL_THRESHOLD}\n`);

  console.log(`  byte-identical:     ${identical.length}`);
  console.log(`  within tolerance:   ${withinTolerance.length}${REVERT && withinTolerance.length ? ' (reverted to baseline)' : ''}`);
  for (const r of withinTolerance) {
    console.log(`      ${r.name.padEnd(62)} ${(r.ratio * 100).toFixed(4)}%  ${r.pixels} px`);
  }
  console.log(`  changed:            ${changed.length}`);
  for (const r of changed) {
    const note = r.resized ? `  resized ${r.baselineSize} -> ${r.candidateSize}` : '';
    console.log(`      ${r.name.padEnd(62)} ${(r.ratio * 100).toFixed(4)}%  ${r.pixels} px${note}`);
  }
  if (added.length) console.log(`  added:              ${added.join(', ')}`);
  if (removed.length) console.log(`  removed:            ${removed.join(', ')}`);
  if (OUT && changed.length) console.log(`\n  diff images written to ${OUT}`);
}

process.exit(changed.length || added.length || removed.length ? 1 : 0);
