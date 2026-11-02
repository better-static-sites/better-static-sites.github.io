/**
 * The llmsTxt option: on, the hub, its .well-known mirror, spokes, and sibling
 * sections are written; off, only .md files are, and a site's own llms.txt is
 * left alone in builds and served in dev.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import genMarkdownPages from '../index.mjs';

const page = (title) =>
  `<!DOCTYPE html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>Body</p></main></body></html>`;

const CUSTOM = '# My own llms.txt\n';

const options = (llmsTxt) => ({
  llmsTxt,
  llmsTxtPath: 'docs/llms.txt',
  spokesDir: 'docs',
  categorize: (u) => u.split('/')[2]?.replace(/\.md$/, ''),
});

function makeSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmp-llms-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write('docs/guides.html', page('Guides'));
  write('docs/guides/a.html', page('Guide A'));
  write('docs/guides/b.html', page('Guide B'));
  // what Astro copies from public/ before build:done runs
  write('docs/llms.txt', CUSTOM);
  return dir;
}

async function build(dir, llmsTxt) {
  const integration = genMarkdownPages(options(llmsTxt));
  integration.hooks['astro:config:done']({ config: { site: 'https://example.com' } });
  await integration.hooks['astro:build:done']({ dir: pathToFileURL(dir + '/'), logger: { info() {} } });
}

const txtFiles = (dir) =>
  fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\\/g, '/')).sort();

// call the dev middleware for a URL; resolves to the body it sent, or 'next' if it passed the request on
function devRequest(llmsTxt, url) {
  let middleware;
  genMarkdownPages(options(llmsTxt)).hooks['astro:server:setup']({
    server: { middlewares: { use: (fn) => { middleware = fn; } } },
  });
  return new Promise((resolve) => {
    middleware({ url, headers: {} }, { setHeader() {}, end: resolve }, () => resolve('next'));
  });
}

test('llmsTxt on: writes the hub, its mirror, spokes, and sibling sections', async () => {
  const dir = makeSite();
  await build(dir, true);

  assert.deepEqual(txtFiles(dir), ['docs/.well-known/llms.txt', 'docs/llms-guides.txt', 'docs/llms.txt']);
  assert.notEqual(fs.readFileSync(path.join(dir, 'docs/llms.txt'), 'utf-8'), CUSTOM, 'the generated hub replaces the copied file');
  assert.ok(fs.readFileSync(path.join(dir, 'docs/guides/a.md'), 'utf-8').includes('## Other pages in Guides'));
});

test('llmsTxt off: writes .md files only and leaves the site\'s llms.txt alone', async () => {
  const dir = makeSite();
  await build(dir, false);

  for (const md of ['docs/guides.md', 'docs/guides/a.md', 'docs/guides/b.md']) {
    assert.ok(fs.existsSync(path.join(dir, md)), `${md} should still be written`);
  }
  assert.deepEqual(txtFiles(dir), ['docs/llms.txt'], 'no hub mirror or spoke files');
  assert.equal(fs.readFileSync(path.join(dir, 'docs/llms.txt'), 'utf-8'), CUSTOM);
  assert.ok(!fs.readFileSync(path.join(dir, 'docs/guides/a.md'), 'utf-8').includes('Other pages in'), 'no sibling section linking to a spoke');
});

test('dev server: stubs llms.txt when on, passes it through when off', async () => {
  assert.match(await devRequest(true, '/docs/llms.txt'), /Dev Mode/);
  assert.match(await devRequest(true, '/docs/.well-known/llms.txt'), /Dev Mode/);
  assert.equal(await devRequest(false, '/docs/llms.txt'), 'next');
  assert.equal(await devRequest(false, '/docs/.well-known/llms.txt'), 'next');
});
