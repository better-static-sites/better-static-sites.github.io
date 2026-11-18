import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { mdxToJs } from 'satteri';
import { loadGlossary } from '../src/core.mjs';
import { remarkGlossaryTerms } from '../src/remark.mjs';
import { glossaryTerms } from '../src/satteri.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const options = { file: 'fixtures/glossary.json', path: '/glossary', root, fields: ['tier'] };

const writeGlossary = (data) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abg-'));
  fs.writeFileSync(path.join(dir, 'g.json'), JSON.stringify(data));
  return { file: 'g.json', path: '/glossary', root: dir };
};

const viaRemark = async (src, opts = options) =>
  String(await compile({ value: src, path: path.join(root, 'page.mdx') }, { remarkPlugins: [[remarkGlossaryTerms, opts]] }));
const viaSatteri = async (src, opts = options) => {
  const out = await mdxToJs(src, { mdastPlugins: [glossaryTerms(opts)] });
  return String(out.code ?? out);
};

test('finds terms by name, alias, and abbreviation, ignoring case', () => {
  const g = loadGlossary(options);
  assert.equal(g.find('jwt').id, 'JSON Web Token');
  assert.equal(g.find(' TENANTS ').id, 'Tenant');
  assert.equal(g.find('nope'), undefined);
});

test('renders definitions as inline HTML, with link text only in tooltips', () => {
  const entry = loadGlossary(options).find('JWT');
  assert.match(entry.definitionHtml, /<a href="https:\/\/www\.rfc-editor\.org/);
  assert.doesNotMatch(entry.tooltipHtml, /<a /);
  assert.equal(entry.anchor, 'json-web-token');
});

test('suggests close matches', () => {
  assert.deepEqual(loadGlossary(options).suggest('Tenent'), ['Tenant']);
});

test('rejects unknown fields unless allowed', () => {
  assert.throws(() => loadGlossary({ ...options, fields: [] }, { fresh: true }), /unknown field "tier"/);
});

test('rejects links that fail linkPattern', () => {
  const opts = writeGlossary({ A: { definition: 'x', link: 'http://insecure' } });
  assert.throws(() => loadGlossary(opts), /"link" must match/);
});

test('rejects a name that points at two entries', () => {
  const opts = writeGlossary({ A: { definition: 'x', link: '/a', aliases: ['B'] }, B: { definition: 'y', link: '/b' } });
  assert.throws(() => loadGlossary(opts), /names both "A" and "B"/);
});

test('validateEntry checks extra fields', () => {
  const opts = writeGlossary({ A: { definition: 'x', link: '/a', tier: 'gold' } });
  assert.throws(() => loadGlossary({ ...opts, fields: ['tier'], validateEntry: (id, e) => e.tier !== 'paid' && 'bad tier' }), /bad tier/);
});

for (const [name, run] of [['remark', viaRemark], ['satteri', viaSatteri]]) {
  test(`${name}: replaces terms and imports the component once`, async () => {
    const js = await run('Use a [[JWT]] in each [[Tenant::tenant]].\n');
    assert.equal(js.match(/import AstroBetterGlossaryTerm from ["']astro-better-glossary\/GlossaryTerm.astro["']/g)?.length, 1);
    assert.match(js, /term: "JSON Web Token"/);
    assert.match(js, /children: "tenant"/);
    assert.match(js, /_jsx\(AstroBetterGlossaryTerm,/);
  });

  test(`${name}: leaves documents without terms alone`, async () => {
    assert.doesNotMatch(await run('No terms here.\n'), /AstroBetterGlossaryTerm/);
  });

  test(`${name}: unknown terms fail with suggestions and the help line`, async () => {
    await assert.rejects(run('A [[Tenent]].\n', { ...options, help: 'See the style guide.' }), (err) => {
      assert.match(err.message, /"Tenent" isn't in the glossary/);
      assert.match(err.message, /\[\[Tenant\]\]/);
      assert.match(err.message, /See the style guide\./);
      return true;
    });
  });

  test(`${name}: terms in headings and links fail`, async () => {
    await assert.rejects(run('## About [[JWT]]\n'), /inside a heading/);
    await assert.rejects(run('[a [[JWT]]](/x)\n'), /inside a link/);
  });

  test(`${name}: unclosed brackets and empty labels fail`, async () => {
    await assert.rejects(run('A [[JWT and more.\n'), /Unclosed glossary term/);
    await assert.rejects(run('A [[JWT::]].\n'), /label after "::" is empty/);
  });
}
