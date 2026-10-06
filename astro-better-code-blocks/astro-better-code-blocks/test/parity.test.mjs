/**
 * Both adapters must render the fixtures exactly like the snapshots, which
 * were generated from the pre-split unified implementation
 * (`node test/gen-snapshots.mjs <dir with the old plugin files>`).
 *
 * Outputs are compared as parsed hast, so serializer differences between
 * rehype-stringify and Sätteri (attribute quoting, entity choice) don't count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { fromHtml } from 'hast-util-from-html';
import { removePosition } from 'unist-util-remove-position';
import { markdownToHtml } from 'satteri';
import { rehypeCodeBlocks, remarkShellSession } from '../index.js';
import { codeBlocks, shellSession } from '../satteri.mjs';
import { addShellPrompts } from '../core.mjs';
import { CASES } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, 'fixtures', f), 'utf8');

// whitespace-only text between block elements depends on the serializer, not the plugin
function tree(html) {
  const t = fromHtml(html, { fragment: true });
  removePosition(t, { force: true });
  const strip = (node) => {
    if (!node.children) return;
    const inPre = node.tagName === 'pre' || node.tagName === 'code';
    node.children = node.children.filter(c => inPre || c.type !== 'text' || c.value.trim() !== '');
    node.children.forEach(strip);
  };
  strip(t);
  return t;
}

async function renderUnified(src, c) {
  const file = await unified().use(remarkParse).use(remarkShellSession, c.shell).use(remarkRehype)
    .use(rehypeCodeBlocks, c.blocks).use(rehypeStringify).process(src);
  return String(file);
}

async function renderSatteri(src, c) {
  const { html } = await markdownToHtml(src, {
    mdastPlugins: [shellSession(c.shell)],
    hastPlugins: [codeBlocks(c.blocks)],
    features: { smartPunctuation: false },
  });
  return html;
}

for (const c of CASES) {
  test(`unified matches snapshot: ${c.name}`, async () => {
    assert.deepEqual(tree(await renderUnified(read(c.input), c)), tree(read(`${c.name}.html`)));
  });

  test(`satteri matches snapshot: ${c.name}`, async () => {
    assert.deepEqual(tree(await renderSatteri(read(c.input), c)), tree(read(`${c.name}.html`)));
  });
}

test('addShellPrompts leaves prompted, continued, and quoted lines alone', () => {
  const input = [
    'npm i',
    '$ ls',
    '# whoami',
    'curl \\',
    '  -d x',
    "echo 'a",
    "b'",
    'next',
  ].join('\n');
  assert.equal(addShellPrompts(input), [
    '$ npm i',
    '$ ls',
    '# whoami',
    '$ curl \\',
    '  -d x',
    "$ echo 'a",
    "b'",
    '$ next',
  ].join('\n'));
});

test('addShellPrompts: blank line resets continuation state', () => {
  assert.equal(addShellPrompts('a \\\n\nb'), '$ a \\\n\n$ b');
});

test('addShellPrompts: custom prompt', () => {
  assert.equal(addShellPrompts('x', '> '), '> x');
});

test('MDX: satteri output matches unified output', async () => {
  const { unifiedTree, satteriTree } = await import('./mdx-render.mjs');
  const source = read('blocks.md').replace('Inline `code` stays inline.', 'Inline `code` and <Note>a component</Note>.');
  const Note = (props) => ({ type: 'element', tagName: 'aside', properties: {}, children: [props.children].flat().map(v => ({ type: 'text', value: v })) });
  const a = await unifiedTree(source, { remarkPlugins: [remarkShellSession], rehypePlugins: [rehypeCodeBlocks], components: { Note } });
  const b = await satteriTree(source, { mdastPlugins: [shellSession()], hastPlugins: [codeBlocks()], components: { Note } });
  assert.ok(JSON.stringify(a).includes('ccb-wrapper'));
  assert.ok(JSON.stringify(a).includes('"tagName":"aside"'));
  assert.deepEqual(b, a);
});

test('copied shell-session text has neither the prompt nor the space after it', async () => {
  const html = await renderUnified('```shell-session\nnpm install\n$ npm run dev\n```\n', CASES[0]);
  // same walk as CopyCodeButton: skip data-no-copy subtrees
  const copy = (node) => node.type === 'text' ? node.value
    : node.properties?.dataNoCopy !== undefined ? ''
    : (node.children ?? []).map(copy).join('');
  const code = fromHtml(html, { fragment: true }).children[0].children[0].children[0];
  assert.equal(code.tagName, 'code');
  assert.equal(copy(code).trim(), 'npm install\nnpm run dev');
});
