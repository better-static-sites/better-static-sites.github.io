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
