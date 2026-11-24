import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightboxHtml, lightboxId, uniqueIds } from '../index.mjs';

const IMG = '<img src="/a.png" alt="A chart">';

test('open button targets the dialog with show-modal', () => {
  const html = lightboxHtml(IMG, { label: 'A chart' });
  const id = lightboxId(IMG);
  assert.ok(html.includes(`commandfor="${id}" command="show-modal"`));
  assert.ok(html.includes(`<dialog id="${id}"`));
  assert.ok(html.includes(`commandfor="${id}" command="close"`));
  assert.ok(html.includes('aria-label="Enlarge: A chart"'));
  assert.ok(html.includes('aria-label="A chart" data-markdown-ignore'));
});

test('content appears inline and in the dialog by default', () => {
  const html = lightboxHtml(IMG);
  assert.equal(html.split(IMG).length - 1, 2);
  assert.ok(html.includes('aria-label="Enlarge"'), 'unnamed content gets a generic button name');
});

test('zoom replaces the dialog copy', () => {
  const html = lightboxHtml(IMG, { zoom: '<img src="/big.png" alt="">' });
  assert.equal(html.split(IMG).length - 1, 1);
  assert.ok(html.includes('/big.png'));
});

test('label is escaped', () => {
  const html = lightboxHtml(IMG, { label: 'Say "hi" <now> & go' });
  assert.ok(html.includes('aria-label="Say &quot;hi&quot; &lt;now> &amp; go"'));
});

test('same content gives the same id; different content does not', () => {
  assert.equal(lightboxId(IMG), lightboxId(IMG));
  assert.notEqual(lightboxId(IMG), lightboxId('<img src="/b.png" alt="">'));
});

test('uniqueIds suffixes ids and every reference to them', () => {
  const svg = '<svg id="m-1"><style>#m-1 .node{fill:#fff}</style><defs><marker id="m-1_end"/></defs>' +
    '<title id="t">T</title><g data-id="t"/><path marker-end="url(#m-1_end)"/><use href="#m-1_end"/><g aria-labelledby="t other"/></svg>';
  const out = uniqueIds(svg, '-zoom');
  assert.ok(out.includes('id="m-1-zoom"'));
  assert.ok(out.includes('#m-1-zoom .node'));
  assert.ok(out.includes('fill:#fff'), 'hex colors are not ids');
  assert.ok(out.includes('url(#m-1_end-zoom)'));
  assert.ok(out.includes('href="#m-1_end-zoom"'));
  assert.ok(out.includes('aria-labelledby="t-zoom other"'), 'unknown ids stay as they are');
  assert.ok(out.includes('data-id="t"'), 'data-id is not an id');
});

test('uniqueIds leaves label text alone when it matches a data-id', () => {
  const svg = '<svg><g class="node" data-id="2"><text>Ticket #2</text></g></svg>';
  assert.equal(uniqueIds(svg, '-zoom'), svg);
});
