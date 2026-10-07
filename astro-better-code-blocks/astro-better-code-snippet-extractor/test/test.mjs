/**
 * extractedCodeSnippets runs bluehawk on each source directory (in parallel),
 * skips work when the source hash is unchanged, and reports the failing directory.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractedCodeSnippets } from '../integration.js';
import { resolveExtractedCodePath } from '../resolve.js';

function makeProject(dirCount = 6) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abcse-'));
  for (let i = 0; i < dirCount; i++) {
    const dir = path.join(root, 'extractedcode', `project-${i}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app.js'), [
      'const setup = true;',
      `// :snippet-start: greet-${i}`,
      `export function greet() { return 'hello ${i}'; }`,
      '// :snippet-end:',
      '',
    ].join('\n'));
  }
  return root;
}

async function runIn(root, opts = {}) {
  const messages = [];
  const cwd = process.cwd();
  process.chdir(root);
  try {
    await extractedCodeSnippets(opts).hooks['astro:config:done']({
      logger: { info: (m) => messages.push(m), warn: (m) => messages.push(`warn: ${m}`) },
    });
  } finally {
    process.chdir(cwd);
  }
  return messages;
}

const snippetFiles = (root) => fs.readdirSync(path.join(root, 'src/generated-code-snippets'), { recursive: true })
  .filter(f => f.endsWith('.js'))
  .sort();

test('writes each directory\'s snippets into its own output folder', async () => {
  const root = makeProject();
  const messages = await runIn(root);
  const files = snippetFiles(root);
  for (let i = 0; i < 6; i++) {
    const file = files.find(f => f.startsWith(`project-${i}${path.sep}`) && f.includes(`greet-${i}`));
    assert.ok(file, `snippet for project-${i}`);
    const text = fs.readFileSync(path.join(root, 'src/generated-code-snippets', file), 'utf-8');
    assert.match(text, new RegExp(`hello ${i}`));
    assert.doesNotMatch(text, /setup/);
  }
  assert.ok(messages.some(m => /snippets? written/.test(m)), messages.join('\n'));
});

test('skips bluehawk when the source is unchanged, reruns when it changes', async () => {
  const root = makeProject(2);
  await runIn(root);
  assert.ok((await runIn(root)).some(m => m.startsWith('snippets up to date')));

  fs.appendFileSync(path.join(root, 'extractedcode/project-1/app.js'), '// changed\n');
  assert.ok((await runIn(root)).some(m => /snippets? written/.test(m)));
});

test('a failing directory throws with its name', async () => {
  const root = makeProject(3);
  fs.writeFileSync(path.join(root, 'extractedcode/project-2/app.js'), '// :snippet-start: broken\nno end tag\n');
  await assert.rejects(runIn(root), /bluehawk snip failed for "project-2"/);
});

const generated = (root, ...parts) => path.join(root, 'src/generated-code-snippets', ...parts);

test('writes a copy of each whole file with bluehawk markup removed', async () => {
  const root = makeProject(1);
  fs.mkdirSync(path.join(root, 'extractedcode/project-0/routes'));
  fs.writeFileSync(path.join(root, 'extractedcode/project-0/routes/index.js'), [
    'const a = 1;',
    '// :snippet-start: outer',
    '// :snippet-start: inner',
    'const b = 2;',
    '// :snippet-end:',
    '// :snippet-end:',
    '// :remove-start:',
    'const debug = true;',
    '// :remove-end:',
    '',
  ].join('\n'));
  await runIn(root);
  const copy = fs.readFileSync(generated(root, 'project-0/routes/index.js'), 'utf-8');
  assert.match(copy, /const a = 1;/);
  assert.match(copy, /const b = 2;/);
  assert.doesNotMatch(copy, /:snippet-|:remove-|debug/);
});

test('forwards state so copies and snippets match a published state', async () => {
  const root = makeProject(1);
  fs.writeFileSync(path.join(root, 'extractedcode/project-0/state.js'), [
    '// :state-start: published',
    'const shipped = true;',
    '// :state-end:',
    '// :state-start: draft',
    'const unfinished = true;',
    '// :state-end:',
    '',
  ].join('\n'));
  await runIn(root, { state: 'published' });
  const copy = fs.readFileSync(generated(root, 'project-0/state.js'), 'utf-8');
  assert.match(copy, /shipped/);
  assert.doesNotMatch(copy, /unfinished|:state-/);
});

test('a file deleted from the source does not leave a stale copy', async () => {
  const root = makeProject(1);
  fs.writeFileSync(path.join(root, 'extractedcode/project-0/old.js'), 'const old = true;\n');
  await runIn(root);
  assert.ok(fs.existsSync(generated(root, 'project-0/old.js')));
  fs.rmSync(path.join(root, 'extractedcode/project-0/old.js'));
  await runIn(root);
  assert.ok(!fs.existsSync(generated(root, 'project-0/old.js')));
  assert.ok(fs.existsSync(generated(root, 'project-0/app.js')));
});

test('resolveExtractedCodePath prefers generated output and falls back to source for ignored files', async () => {
  const root = makeProject(1);
  fs.writeFileSync(path.join(root, 'extractedcode/project-0/package.json'), '{}\n');
  await runIn(root);
  const snippetRoot = path.join(root, 'src/generated-code-snippets');
  const sourceRoot = path.join(root, 'extractedcode');
  assert.equal(resolveExtractedCodePath('project-0/app.snippet.greet-0.js', snippetRoot, sourceRoot),
               path.join(snippetRoot, 'project-0/app.snippet.greet-0.js'));
  assert.equal(resolveExtractedCodePath('project-0/app.js', snippetRoot, sourceRoot),
               path.join(snippetRoot, 'project-0/app.js'));
  assert.equal(resolveExtractedCodePath('project-0/package.json', snippetRoot, sourceRoot),
               path.join(sourceRoot, 'project-0/package.json'));
});

test('output from another version or other options is regenerated even when the source is unchanged', async () => {
  const root = makeProject(1);
  await runIn(root);
  assert.ok((await runIn(root)).some(m => m.startsWith('snippets up to date')));

  // a cache restored from 0.2.x has a matching .snippets-hash but no generator record
  fs.rmSync(generated(root, '.snippets-generator'));
  assert.ok((await runIn(root)).some(m => /snippets? written/.test(m)));

  assert.ok((await runIn(root, { state: 'published' })).some(m => /snippets? written/.test(m)));
  assert.ok((await runIn(root, { state: 'published' })).some(m => m.startsWith('snippets up to date')));
});

test('a changed bluehawk plugin regenerates the output', async () => {
  const root = makeProject(1);
  fs.writeFileSync(path.join(root, 'plugin.js'), 'module.exports = { register() {} };\n');
  await runIn(root, { plugin: 'plugin.js' });
  assert.ok((await runIn(root, { plugin: 'plugin.js' })).some(m => m.startsWith('snippets up to date')));
  fs.appendFileSync(path.join(root, 'plugin.js'), '// changed\n');
  assert.ok((await runIn(root, { plugin: 'plugin.js' })).some(m => /snippets? written/.test(m)));
});
