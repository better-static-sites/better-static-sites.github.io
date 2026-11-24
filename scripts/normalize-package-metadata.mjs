#!/usr/bin/env node
/**
 * One-off: brings every publishable package's metadata up to npm conventions.
 *
 * Sets `repository` (monorepo URL plus `directory`, which is what npm wants for
 * a monorepo and what `--provenance` verifies against), `homepage` and `bugs`,
 * and gives every package an explicit `files` list so publishing cannot pick up
 * stray files such as repositoryUrl.txt or package-lock.json.
 *
 * Idempotent, so it is safe to re-run after adding a package. Keeping it in the
 * repo means the next package added can be normalized the same way instead of
 * by hand.
 *
 * Usage:
 *   scripts/normalize-package-metadata.mjs [--check]
 *
 *   --check  report what would change and exit 1 if anything would, without
 *            writing. Use this in CI to catch a package added without metadata.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { listPackages } from './lib/packages.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = 'git+https://github.com/better-static-sites/better-static-sites.github.io.git';
const ISSUES_URL = 'https://github.com/better-static-sites/better-static-sites.github.io/issues';
const HOMEPAGE = 'https://better-static-sites.github.io';

const CHECK = process.argv.includes('--check');

// Explicit allowlists, so a new test file or lockfile never lands in a tarball.
// npm always adds package.json, README and LICENSE on top of these.
// Keys are npm package names (astro-better-*), not folder names.
const FILES = {
  'astro-better-admonitions': ['*.js', '*.astro', '*.css'],
  'astro-better-cards': ['*.astro'],
  'astro-better-code-blocks': ['*.js', '*.mjs', '*.astro', '*.css'],
  'astro-better-code-snippet-extractor': ['*.js', '*.astro'],
  'astro-better-declarative-screenshots': ['index.mjs', '*.astro', 'src/'],
  'astro-better-details': ['Details.astro'],
  'astro-better-docs-sidebar': ['*.astro', 'tree.js'],
  'astro-better-generate-screenshots': ['index.mjs', 'src/', 'scripts/'],
  'astro-better-gen-markdown-pages': ['index.mjs', 'src/'],
  'astro-better-lightbox': ['index.mjs', '*.astro', 'styles.css'],
  'astro-better-link-checker': ['index.mjs'],
  'astro-better-mermaid': ['index.mjs', 'src/'],
  'astro-better-nav-bar': ['*.js', '*.astro', '*.css'],
  'astro-better-refs': ['index.mjs', 'core.mjs', 'satteri.mjs', 'Ref.astro'],
  'astro-better-release-notes': ['*.js', '*.astro', '*.css'],
  'astro-better-steps': ['*.js', '*.astro', '*.css'],
  'astro-better-tables': ['Table.astro', 'TableGrid.astro', 'Row.astro', 'Cell.astro'],
  'astro-better-tabs': ['*.astro', 'style.css'],
  // index.test.js lives in src/, so the list is per-extension rather than 'src/'
  'astro-better-toc': ['src/index.js', 'src/process.js', 'src/TOC.astro', 'src/InlineTOC.astro'],
};

const changes = [];

for (const pkg of listPackages(REPO_ROOT)) {
  const manifestPath = join(pkg.dir, 'package.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw);
  const before = JSON.stringify(manifest);

  const directory = relative(REPO_ROOT, pkg.dir).split('\\').join('/');

  manifest.repository = { type: 'git', url: REPO_URL, directory };
  manifest.homepage = HOMEPAGE;
  manifest.bugs = { url: ISSUES_URL };

  const files = FILES[manifest.name];
  if (!files) {
    console.error(`No files allowlist for ${manifest.name}. Add one to FILES.`);
    process.exitCode = 1;
    continue;
  }
  manifest.files = files;

  if (!existsSync(join(pkg.dir, 'LICENSE.md'))) {
    changes.push(`${manifest.name}: missing LICENSE.md`);
  }

  if (JSON.stringify(manifest) === before) continue;

  changes.push(`${manifest.name}: metadata updated`);
  if (!CHECK) writeFileSync(manifestPath, `${orderKeys(manifest)}\n`);
}

/** Keeps package.json in a conventional key order rather than mutation order. */
function orderKeys(manifest) {
  const order = [
    'name', 'version', 'description', 'keywords', 'license', 'author',
    'repository', 'homepage', 'bugs', 'type', 'main', 'bin', 'exports', 'files',
    'workspaces', 'scripts', 'dependencies', 'peerDependencies',
    'peerDependenciesMeta', 'devDependencies', 'private',
  ];
  const ordered = {};
  for (const key of order) if (key in manifest) ordered[key] = manifest[key];
  for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
  return JSON.stringify(ordered, null, 2);
}

if (!changes.length) {
  console.log('All package metadata is already normalized.');
  process.exit(0);
}

console.log(`${CHECK ? 'Would update' : 'Updated'} ${changes.length} item(s):`);
for (const c of changes) console.log(`  ${c}`);
if (CHECK) process.exit(1);
