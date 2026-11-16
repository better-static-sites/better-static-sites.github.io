// splits a run across processes. each shard gets whole source files, so screenshots on one page
// share one app instance and run in the same order as an unsharded run.

import { spawn } from 'child_process';

/**
 * Parse a `--shard` value such as `2/4` into a zero-based index and a count.
 * @param {string} value
 * @returns {{ index: number, count: number }}
 */
export function parseShard(value) {
  const m = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const index = m ? Number(m[1]) : NaN, count = m ? Number(m[2]) : NaN;
  if (!(count >= 1 && index >= 1 && index <= count)) throw new Error(`--shard takes <index>/<count> with 1 <= index <= count, got: ${value}`);
  return { index: index - 1, count };
}

/**
 * Keep the specs that belong to one shard. Files go to the least loaded shard, biggest first.
 * @param {import('./discover.mjs').ScreenshotSpec[]} specs
 * @param {{ index: number, count: number }} shard
 * @param {(spec: import('./discover.mjs').ScreenshotSpec) => number} weight - captures a spec produces
 */
export function specsForShard(specs, { index, count }, weight) {
  const files = new Map();
  for (const spec of specs) files.set(spec.sourceFile, (files.get(spec.sourceFile) ?? 0) + weight(spec));
  const loads = Array(count).fill(0);
  const owner = new Map();
  for (const [file, load] of [...files].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const shard = loads.indexOf(Math.min(...loads));
    loads[shard] += load;
    owner.set(file, shard);
  }
  return specs.filter(spec => owner.get(spec.sourceFile) === index);
}

/**
 * Run `count` copies of this CLI, one per shard, and prefix their output with the shard.
 * @param {string} script - path of the CLI script
 * @param {string[]} args - CLI arguments without --shards
 * @param {number} count
 * @returns {Promise<number>} exit code: 0 when every shard succeeded
 */
export async function runShards(script, args, count) {
  console.log(`[screenshots] running ${count} shards in parallel`);
  const codes = await Promise.all(Array.from({ length: count }, (_, i) => new Promise(resolve => {
    const label = `[shard ${i + 1}/${count}] `;
    const child = spawn(process.execPath, [script, ...args, '--shard', `${i + 1}/${count}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    prefixLines(child.stdout, process.stdout, label);
    prefixLines(child.stderr, process.stderr, label);
    child.on('error', e => { console.error(`${label}could not start: ${e.message}`); resolve(1); });
    child.on('close', code => resolve(code ?? 1));
  })));
  const failed = codes.map((code, i) => ({ code, shard: i + 1 })).filter(s => s.code !== 0);
  for (const { code, shard } of failed) console.error(`[screenshots] shard ${shard}/${count} exited with code ${code}; see its [shard ${shard}/${count}] lines above`);
  if (!failed.length) console.log(`[screenshots] all ${count} shards finished`);
  return failed.length ? 1 : 0;
}

// a progress line is written in two parts, so hold partial lines until they end
function prefixLines(from, to, label) {
  let pending = '';
  from.setEncoding('utf8');
  from.on('data', chunk => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    for (const line of lines) to.write(`${label}${line}\n`);
  });
  from.on('end', () => { if (pending) to.write(`${label}${pending}\n`); });
}
