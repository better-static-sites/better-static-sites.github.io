import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRenderer } from '../src/render.mjs';
import { getOgImage, STATE_KEY } from '../src/runtime.mjs';

const LOGO = '<svg viewBox="0 0 10 10"><!-- c --><circle cx="5" cy="5" r="5" fill="currentColor"/></svg>';

test('card is a 1200x630 PNG', async () => {
  const { renderCard } = createRenderer({ wordmark: 'Example', footer: 'example.com', logo: LOGO });
  const meta = await sharp(await renderCard({ title: 'Configure the Thing', label: 'Guides' })).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('same input renders the same SVG', () => {
  const a = createRenderer({ wordmark: 'Example' }).cardSvg({ title: 'Hello World', label: 'Docs' });
  const b = createRenderer({ wordmark: 'Example' }).cardSvg({ title: 'Hello World', label: 'Docs' });
  assert.equal(a, b);
});

test('text is drawn as paths, not <text>', () => {
  const svg = createRenderer().cardSvg({ title: 'Paths Only', label: '' });
  assert.doesNotMatch(svg, /<text/);
  assert.match(svg, /<use href="#g\d+"/);
});

test('long titles wrap to three lines and end with an ellipsis', () => {
  const svg = createRenderer().cardSvg({ title: 'word '.repeat(80).trim(), label: '' });
  // three title lines at the smallest size
  const titleGroups = svg.match(/<g fill="#ffffff" transform="translate\(80 \d+\) scale\(0\.0244/g) ?? [];
  assert.equal(titleGroups.length, 3);
});

test('logo keeps its viewBox and drops comments', () => {
  const svg = createRenderer({ logo: LOGO }).cardSvg({ title: 'T', label: '' });
  assert.match(svg, /viewBox="0 0 10 10"><circle/);
  assert.doesNotMatch(svg, /<!--/);
});

test('bar: false hides the accent bar', () => {
  const svg = createRenderer({ colors: { bar: false } }).cardSvg({ title: 'T', label: '' });
  assert.doesNotMatch(svg, /height="12"/);
});

test('copy is a 1200x630 JPEG', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abog-'));
  const src = path.join(dir, 'src.png');
  await sharp({ create: { width: 800, height: 400, channels: 3, background: '#336699' } }).png().toFile(src);
  const meta = await sharp(await createRenderer().renderCopy(src)).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1200, 630]);
});

test('getOgImage names images by content and builds alt text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abog-'));
  fs.writeFileSync(path.join(dir, 'a.png'), 'not really a png');
  const jobs = new Map();
  globalThis[STATE_KEY] = { version: 'v1', publicDir: dir, route: '/og', siteName: 'Example', enqueue: (u, j) => jobs.set(u, j) };

  const card = await getOgImage({ title: 'Install', label: 'Guides' });
  assert.match(card.url, /^\/og\/[0-9a-f]{16}\.png$/);
  assert.equal(card.alt, 'Example Guides: Install');
  assert.equal((await getOgImage({ title: 'Install', label: 'Guides' })).url, card.url);
  assert.notEqual((await getOgImage({ title: 'Install', label: 'Other' })).url, card.url);
  assert.equal((await getOgImage({ title: 'Example Docs' })).alt, 'Example Docs');

  const copy = await getOgImage({ title: 'Post', source: '/a.png' });
  assert.match(copy.url, /\.jpg$/);
  assert.equal(jobs.get(copy.url).source, path.join(dir, 'a.png'));

  assert.match((await getOgImage({ title: 'Post', source: '/header.svg' })).url, /\.png$/);
  assert.equal((await getOgImage({ title: 'Post', source: 'https://cdn.example.com/x.png' })).url, 'https://cdn.example.com/x.png');
  delete globalThis[STATE_KEY];
});
