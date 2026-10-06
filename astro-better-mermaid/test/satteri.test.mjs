/**
 * Stable ids, the render cache, and parity between the unified and Sätteri
 * adapters. Parity runs one document through each pipeline and compares the
 * parsed HTML, so serializer differences don't count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { fromHtml } from 'hast-util-from-html';
import { removePosition } from 'unist-util-remove-position';
import { markdownToHtml } from 'satteri';
import { remarkMermaidSSR, mermaidTitleFix } from '../index.mjs';
import { mermaidSSR, mermaidTitle } from '../src/satteri.mjs';
import { createRenderer } from '../src/core.mjs';

const FLOW = 'flowchart LR\n  A[Client] -->|login| B[Auth Server]';
const PIE = 'pie title MFA\n  "TOTP" : 40\n  "SMS" : 20';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abm-'));

test('same source and index → identical output across renderers', async () => {
  const a = await createRenderer({ cache: false })(FLOW, 0);
  const b = await createRenderer({ cache: false })(FLOW, 0);
  assert.ok(a.includes('<svg'));
  assert.equal(a, b);
  assert.match(a, /id="mermaid-ssr-0-[0-9a-f]{6}"/);
});

test('same source at different indexes → different ids', async () => {
  const render = createRenderer({ cache: false });
  const [a, b] = await Promise.all([render(FLOW, 0), render(FLOW, 1)]);
  assert.notEqual(a.match(/id="(mermaid-ssr-[^"]+)"/)[1], b.match(/id="(mermaid-ssr-[^"]+)"/)[1]);
});

test('disk cache: second renderer reads the entry instead of rendering', async () => {
  const cacheDir = tmpDir();
  const first = await createRenderer({ cacheDir })(FLOW, 0);
  const [entry] = fs.readdirSync(cacheDir);
  assert.ok(entry?.endsWith('.svg'), 'cache entry written');
  assert.equal(fs.readFileSync(path.join(cacheDir, entry), 'utf-8'), first);

  fs.writeFileSync(path.join(cacheDir, entry), 'SENTINEL');
  assert.equal(await createRenderer({ cacheDir })(FLOW, 0), 'SENTINEL');
});

test('disk cache: key covers theme', async () => {
  const cacheDir = tmpDir();
  await createRenderer({ cacheDir, theme: 'default' })(PIE, 0);
  await createRenderer({ cacheDir, theme: 'dark' })(PIE, 0);
  assert.equal(fs.readdirSync(cacheDir).length, 2);
});

test('disk cache: failed diagrams are not cached', async () => {
  const cacheDir = tmpDir();
  assert.equal(await createRenderer({ cacheDir })('this is not mermaid !!!', 0), null);
  assert.deepEqual(fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg')), []);
});

test('cache: false writes nothing', async () => {
  const cacheDir = tmpDir();
  await createRenderer({ cacheDir, cache: false })(FLOW, 0);
  assert.deepEqual(fs.readdirSync(cacheDir), []);
});

// ── parity ────────────────────────────────────────────────────────────────────

const DOC = [
  '# Diagrams',
  '',
  '```mermaid title="Login flow"',
  FLOW,
  '```',
  '',
  'Between the diagrams.',
  '',
  '```mermaid',
  PIE,
  '```',
  '',
  '```mermaid title="Same flow again"',
  FLOW,
  '```',
  '',
  '```js title="not mermaid"',
  'const x = 1;',
  '```',
  '',
  '```mermaid',
  'this is not mermaid !!!',
  '```',
  '',
].join('\n');

function tree(html) {
  const t = fromHtml(html, { fragment: true });
  removePosition(t, { force: true });
  const strip = (node) => {
    if (!node.children) return;
    node.children = node.children.filter(c => c.type !== 'text' || c.value.trim() !== '' || node.tagName === 'pre' || node.tagName === 'code');
    node.children.forEach(strip);
  };
  strip(t);
  return t;
}

test('satteri output matches unified output', async () => {
  const opts = { cache: false };
  const viaUnified = String(await unified()
    .use(remarkParse).use(mermaidTitleFix).use(remarkMermaidSSR, opts)
    .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeStringify)
    .process(DOC));
  const { html: viaSatteri } = await markdownToHtml(DOC, {
    mdastPlugins: [mermaidTitle(), mermaidSSR(opts)],
    features: { smartPunctuation: false },
  });

  assert.equal((viaUnified.match(/<svg/g) ?? []).length, 3, 'three diagrams render, the invalid one stays code');
  assert.ok(viaUnified.includes('data-title-bottom="Login flow"'));
  assert.deepEqual(tree(viaSatteri), tree(viaUnified));
});

test('satteri: diagram index restarts for each document', async () => {
  const plugins = [mermaidSSR({ cache: false })];
  const one = await markdownToHtml('```mermaid\n' + FLOW + '\n```\n', { mdastPlugins: plugins });
  const two = await markdownToHtml('```mermaid\n' + FLOW + '\n```\n', { mdastPlugins: plugins });
  assert.match(one.html, /id="mermaid-ssr-0-/);
  assert.equal(one.html, two.html);
});

test('MDX: satteri output matches unified output', async () => {
  const { unifiedTree, satteriTree } = await import('./mdx-render.mjs');
  const opts = { cache: false };
  const source = DOC.replace('Between the diagrams.', 'Between the <strong>diagrams</strong>, with {"an expression"}.');
  const a = await unifiedTree(source, { remarkPlugins: [mermaidTitleFix, [remarkMermaidSSR, opts]] });
  const b = await satteriTree(source, { mdastPlugins: [mermaidTitle(), mermaidSSR(opts)] });
  assert.ok(JSON.stringify(a).includes('"tagName":"svg"'));
  assert.ok(JSON.stringify(a).includes('#mermaid-ssr-0-'), 'scoped CSS survives as text');
  assert.deepEqual(b, a);
});

test('integration: adds the satteri plugins to a satteri processor', () => {
  return import('../index.mjs').then(({ default: astroMermaidSSR }) => {
    const processor = { name: 'satteri', options: { mdastPlugins: [], hastPlugins: [], features: {} } };
    let updated;
    astroMermaidSSR({ injectCSS: false, cache: false }).hooks['astro:config:setup']({
      config: { markdown: { processor } },
      updateConfig: (c) => { updated = c; },
      injectScript() {},
    });
    assert.deepEqual(processor.options.mdastPlugins.map(p => typeof p === 'function' ? p().name : p.name), ['astro-better-mermaid:title', 'astro-better-mermaid:ssr']);
    assert.equal(updated.markdown, undefined, 'no remark plugins for a satteri processor');
    assert.deepEqual(updated.vite.ssr.external, ['svgdom', 'mermaid']);
  });
});

test('integration: registers remark plugins without a satteri processor', async () => {
  const { default: astroMermaidSSR } = await import('../index.mjs');
  let updated;
  astroMermaidSSR({ injectCSS: false, titleFix: false }).hooks['astro:config:setup']({
    config: { markdown: {} },
    updateConfig: (c) => { updated = c; },
    injectScript() {},
  });
  assert.equal(updated.markdown.remarkPlugins.length, 1);
  assert.equal(updated.markdown.remarkPlugins[0][0], remarkMermaidSSR);
});
