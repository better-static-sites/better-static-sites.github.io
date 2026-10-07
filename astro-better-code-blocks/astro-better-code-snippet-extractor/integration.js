import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_IGNORE = [
  'node_modules', 'vendor', '.gitignore', '.DS_Store',
  'package*.json', '*.lock', 'repositoryUrl.txt',
  'tests', 'LICENSE', 'SECURITY.md',
];

function hashDir(sourcePath) {
  const hash = createHash('sha256');
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        hash.update(full.slice(sourcePath.length));
        hash.update(readFileSync(full));
      }
    }
  }
  walk(sourcePath);
  return hash.digest('hex');
}

function countFiles(dir, exclude) {
  let n = 0;
  function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (full !== exclude) n++;
    }
  }
  try { walk(dir); } catch { /* dir may not exist yet */ }
  return n;
}

function pruneEmptyDirs(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = join(dir, e.name);
    pruneEmptyDirs(full);
    if (readdirSync(full).length === 0) rmSync(full, { recursive: true });
  }
}

function filterOutput(raw) {
  return raw.split('\n')
    .filter(l => !l.includes('parsed file') && !l.includes('found binary file'))
    .join('\n')
    .trim();
}

// bluehawk's own entry point, run with this Node; npx only as a fallback.
// Skipping npx saves about half a second of startup per directory.
function bluehawkCommand() {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('bluehawk/package.json');
    const { bin } = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const entry = typeof bin === 'string' ? bin : bin.bluehawk;
    return { file: process.execPath, args: [join(dirname(pkgPath), entry)] };
  } catch {
    return { file: 'npx', args: ['--yes', 'bluehawk'] };
  }
}

function run(file, args, opts) {
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, opts);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf-8').on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolvePromise({ status: 1, stdout, stderr: stderr + err.message }));
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
  });
}

// results come back in input order, whatever order the work finishes in
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Astro integration: runs `bluehawk snip` and `bluehawk copy` on each subdirectory of sourceDir,
 * in parallel, and writes the snippets and a markup-free copy of each project to outputDir.
 * Skips if source content is unchanged.
 *
 * @param {object} [opts]
 * @param {string} [opts.sourceDir='extractedcode'] - directory of tested source projects, relative to project root
 * @param {string} [opts.outputDir='src/generated-code-snippets'] - where generated snippets and copies land
 * @param {string[]} [opts.ignore] - patterns forwarded to bluehawk --ignore
 * @param {string} [opts.plugin] - optional bluehawk plugin path (relative to project root)
 * @param {string} [opts.state] - optional bluehawk state forwarded to --state, e.g. to match a published copy
 */
export function extractedCodeSnippets({
  sourceDir = 'extractedcode',
  outputDir = 'src/generated-code-snippets',
  ignore = DEFAULT_IGNORE,
  plugin,
  state,
} = {}) {
  return {
    name: 'astro-better-code-snippet-extractor',
    hooks: {
      'astro:config:done': async ({ logger }) => {
        const root = process.cwd();
        const sourcePath = resolve(root, sourceDir);
        const outputPath = resolve(root, outputDir);
        const hashFile = join(outputPath, '.snippets-hash');

        if (!existsSync(sourcePath)) {
          logger.warn(`source directory not found: ${sourcePath} -- skipping snippet generation`);
          return;
        }

        mkdirSync(outputPath, { recursive: true });

        const currentHash = hashDir(sourcePath);
        const snippetCount = countFiles(outputPath, hashFile);

        if (
          existsSync(hashFile) &&
          readFileSync(hashFile, 'utf-8').trim() === currentHash &&
          snippetCount > 0
        ) {
          logger.info(`snippets up to date (${snippetCount} files)`);
          return;
        }

        const dirs = readdirSync(sourcePath, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name);

        if (dirs.length === 0) {
          logger.warn(`no subdirectories found in ${sourcePath}`);
          return;
        }

        // NODE_ENV=development causes bluehawk to include .ts in its extension list,
        // which matches .d.ts files; Node 22.6+ then fails when trying to strip types
        // from .d.ts files in node_modules.
        const spawnEnv = { ...process.env };
        delete spawnEnv.NODE_ENV;

        const command = bluehawkCommand();
        const bluehawk = (subcommand, dir, dirOutput) => {
          const args = [...command.args, subcommand, join(sourcePath, dir), '--output', dirOutput];
          if (plugin) args.push('--plugin', plugin);
          if (state) args.push('--state', state);
          for (const pattern of ignore) args.push('--ignore', pattern);
          return run(command.file, args, { cwd: root, env: spawnEnv });
        };
        // cleared first so a file deleted from the source can't linger as a stale copy
        const runDir = async (dir) => {
          const dirOutput = join(outputPath, dir);
          rmSync(dirOutput, { recursive: true, force: true });
          mkdirSync(dirOutput, { recursive: true });
          const snip = await bluehawk('snip', dir, dirOutput);
          if (snip.status !== 0 || (snip.stdout + snip.stderr).includes('bluehawk errors')) {
            return { ...snip, subcommand: 'snip' };
          }
          const copy = await bluehawk('copy', dir, dirOutput);
          return { ...copy, subcommand: 'copy', snipStdout: snip.stdout };
        };

        // each directory writes only to its own output folder, so they can run side by side
        const results = await mapLimit(dirs, availableParallelism(), runDir);

        let totalWritten = 0;
        for (const [i, { status, stdout, stderr, subcommand, snipStdout }] of results.entries()) {
          if (status !== 0 || (stdout + stderr).includes('bluehawk errors')) {
            throw new Error(
              `bluehawk ${subcommand} failed for "${dirs[i]}":\n${filterOutput(stdout + stderr)}`
            );
          }
          totalWritten += (snipStdout.match(/wrote text file/g) || []).length;
        }

        pruneEmptyDirs(outputPath);
        writeFileSync(hashFile, currentHash);
        logger.info(`${totalWritten} snippet${totalWritten !== 1 ? 's' : ''} written`);
      },
    },
  };
}
