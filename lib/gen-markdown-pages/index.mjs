import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { htmlToMarkdown, createConverter, transformUrl } from './src/convert.mjs';

export { htmlToMarkdown, createConverter, transformUrl };

const WORKER_PATH = fileURLToPath(new URL('./src/worker.mjs', import.meta.url));

// Files per message. Small batches keep every worker busy until the end even
// when page sizes vary a lot.
const BATCH_SIZE = 16;

// long enough to span the gap between back-to-back build:done hooks
const IDLE_SHUTDOWN_MS = 1000;

/**
 * One pool for every instance of the integration in a build. Sites often run
 * several instances (one per section), and their build:done hooks run back to
 * back, so the workers and their converters are started once and reused.
 * Workers are unref'd, so an idle pool never keeps the process alive.
 */
let pool = null;

function getPool() {
  if (pool) return pool;
  const size = Math.max(1, os.cpus().length);
  const pending = new Map(); // batch id → { resolve, reject, worker }
  const idle = [];
  const queue = [];
  let nextId = 0;
  let idleTimer = null;

  const shutdown = () => {
    pool = null;
    for (const worker of workers) worker.terminate();
  };

  const dispatch = () => {
    clearTimeout(idleTimer);
    if (!queue.length && !pending.size) {
      idleTimer = setTimeout(shutdown, IDLE_SHUTDOWN_MS);
      idleTimer.unref();
    }
    while (idle.length && queue.length) {
      const worker = idle.pop();
      const task = queue.shift();
      pending.set(task.id, { ...task, worker });
      worker.ref();
      worker.postMessage({ id: task.id, files: task.files, opts: task.opts });
    }
  };

  const workers = new Set();
  // a worker that dies on startup would otherwise respawn forever
  let respawnsLeft = size * 2;
  const spawn = () => {
    const worker = new Worker(WORKER_PATH);
    workers.add(worker);
    worker.unref();
    worker.on('message', ({ id, results }) => {
      const task = pending.get(id);
      pending.delete(id);
      worker.unref();
      idle.push(worker);
      task?.resolve(results);
      dispatch();
    });
    let dead = false;
    const fail = (err) => {
      if (dead || pool === null) return;
      dead = true;
      // reject whatever this worker held, and replace it so later batches still run
      for (const [id, task] of pending) {
        if (task.worker !== worker) continue;
        pending.delete(id);
        task.reject(err);
      }
      const at = idle.indexOf(worker);
      if (at >= 0) idle.splice(at, 1);
      workers.delete(worker);
      // replace it only while there is work left, never during shutdown
      if (!queue.length) return;
      if (respawnsLeft-- > 0) { spawn(); dispatch(); return; }
      if (workers.size === 0) for (const task of queue.splice(0)) task.reject(err);
    };
    worker.once('error', fail);
    worker.on('exit', (code) => fail(new Error(`[gen-markdown] worker exited with code ${code}`)));
    idle.push(worker);
  };

  for (let i = 0; i < size; i++) spawn();

  pool = {
    run(files, opts) {
      const batches = [];
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(new Promise((resolve, reject) => {
          queue.push({ id: nextId++, files: files.slice(i, i + BATCH_SIZE), opts, resolve, reject });
        }));
      }
      dispatch();
      // batch order, not completion order, so results follow the file walk
      return Promise.all(batches).then(r => r.flat());
    },
  };
  return pool;
}

function walkHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(p));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function defaultFormatCategoryName(name) {
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Returns path segments after the category key, with .md extension stripped.
// subParts.length === 0  → root/landing page for the category
// subParts.length === 1  → top-level file (no sub-folder)
// subParts.length >= 2   → nested; subParts[0..n-2] are folder names, last is filename
function getSubParts(url, categoryKey) {
  const withoutExt = url.replace(/\.md$/, '');
  const segs = withoutExt.split('/').filter(Boolean);
  const catIdx = segs.indexOf(categoryKey);
  if (catIdx < 0) return [];
  return segs.slice(catIdx + 1);
}

// Build a spoke file with H2/H3/H4 hierarchy based on URL sub-path structure.
function buildSpokeContent(name, entries, formatSubsectionName) {
  let out = `# ${name}\n\n> ${name} documentation.\n\n`;

  // Root page (e.g. /docs/apis.md — the overview for the category)
  const rootEntries = entries.filter(e => e.subParts.length === 0);
  if (rootEntries.length > 0) out += rootEntries.map(e => e.line).join('\n') + '\n\n';

  // Top-level files (e.g. /docs/apis/users.md — one level inside, no sub-folder)
  const topEntries = entries.filter(e => e.subParts.length === 1);
  if (topEntries.length > 0) out += topEntries.map(e => e.line).join('\n') + '\n\n';

  // H2 groups: keyed by subParts[0] when subParts.length >= 2
  const h2Map = new Map();
  for (const e of entries) {
    if (e.subParts.length < 2) continue;
    const key = e.subParts[0];
    if (!h2Map.has(key)) h2Map.set(key, []);
    h2Map.get(key).push(e);
  }

  for (const [h2Key, h2Entries] of h2Map) {
    out += `## ${formatSubsectionName(h2Key)}\n\n`;

    // Direct entries at H2 level (subParts.length === 2)
    const h2Direct = h2Entries.filter(e => e.subParts.length === 2);
    if (h2Direct.length > 0) out += h2Direct.map(e => e.line).join('\n') + '\n\n';

    // H3 groups: keyed by subParts[1] when subParts.length >= 3
    const h3Map = new Map();
    for (const e of h2Entries) {
      if (e.subParts.length < 3) continue;
      const key = e.subParts[1];
      if (!h3Map.has(key)) h3Map.set(key, []);
      h3Map.get(key).push(e);
    }

    for (const [h3Key, h3Entries] of h3Map) {
      out += `### ${formatSubsectionName(h3Key)}\n\n`;

      const h3Direct = h3Entries.filter(e => e.subParts.length === 3);
      if (h3Direct.length > 0) out += h3Direct.map(e => e.line).join('\n') + '\n\n';

      // H4 groups: keyed by subParts[2] when subParts.length >= 4
      const h4Map = new Map();
      for (const e of h3Entries) {
        if (e.subParts.length < 4) continue;
        const key = e.subParts[2];
        if (!h4Map.has(key)) h4Map.set(key, []);
        h4Map.get(key).push(e);
      }

      for (const [h4Key, h4Entries] of h4Map) {
        out += `#### ${formatSubsectionName(h4Key)}\n\n`;
        out += h4Entries.map(e => e.line).join('\n') + '\n\n';
      }
    }
  }

  return out;
}

/**
 * Astro integration that generates .md companion files and an llms.txt index
 * for every HTML page in the build output.
 *
 * @param {object} [opts]
 * @param {string} [opts.indexUrl]
 *   Full URL of the llms.txt hub file, used in the per-page backlink header.
 *   Defaults to `${siteUrl}/${llmsTxtPath}`.
 * @param {(urlPath: string) => boolean} [opts.indexFilter]
 *   Return true for pages to include in the llms.txt index. Default: include all.
 * @param {(urlPath: string) => string} [opts.categorize]
 *   Map a page URL path to a raw category key. Return null/'' to omit from the index.
 *   Default: use the first path segment.
 * @param {(key: string) => string} [opts.formatCategoryName]
 *   Convert a raw category key to a display name. Default: title-case with hyphens as spaces.
 * @param {(key: string) => string} [opts.formatSubsectionName]
 *   Convert a sub-folder key to a heading name for spoke-file H2/H3/H4 sections.
 *   Defaults to formatCategoryName.
 * @param {(names: string[]) => string[]} [opts.sortCategories]
 *   Sort display names before writing. Default: alphabetical.
 * @param {boolean} [opts.createLlmsTxt]
 *   Create llms.txt files. Default: true.
 * @param {string} [opts.llmsTxtPath]
 *   Path relative to the dist root where llms.txt is written. Default: 'llms.txt'.
 * @param {string} [opts.llmsTxtTitle]
 *   H1 title in llms.txt. Default: 'Documentation'.
 * @param {string} [opts.llmsTxtDescription]
 *   Blockquote description in llms.txt. Omitted when empty.
 * @param {string|null} [opts.spokesDir]
 *   When set, each category gets its own `llms-{slug}.txt` file under `{spokesDir}/`
 *   and the hub links to them. When null, all entries are inlined in the hub.
 * @param {string[]} [opts.inlineCategories]
 *   Category display names to inline in the hub even when spokesDir is set.
 * @param {string} [opts.mdPathPlaceholder]
 *   Placeholder string in built HTML to replace with the page's .md public URL.
 *   Default: 'LLM_MD_PATH_PLACEHOLDER'.
 * @param {string} [opts.mdLinkId]
 *   ID of a `<link>` element whose href gets rewritten to the .md URL.
 *   Default: 'llm-md-link'.
 * @param {string} [opts.trimTitleSuffix]
 *   Trailing substring to strip from extracted page titles before they appear in llms.txt link
 *   text and .md headings (e.g. ' | My Site'). Matched exactly, case-sensitively, after trimming.
 *   Useful when your HTML `<title>` and `og:title` include a site-name suffix.
 * @param {(urlPath: string) => boolean} [opts.pageFilter]
 *   Return true for pages that should have a .md companion file written by this instance.
 *   Receives the md URL path (e.g. '/docs/foo.md'). Default: include all pages.
 *   Use this when multiple plugin instances each own a section so they don't overwrite each other.
 */
export default function genMarkdownPages(opts = {}) {
  const {
    indexUrl: configuredIndexUrl = '',
    pageFilter = null,
    indexFilter = () => true,
    categorize = (urlPath) => urlPath.split('/').filter(Boolean)[0] || 'root',
    formatCategoryName = defaultFormatCategoryName,
    sortCategories = (names) => [...names].sort(),
    docsIndexUrl = '',
    createLlmsTxt = true,
    llmsTxtPath = 'llms.txt',
    llmsTxtTitle = 'Documentation',
    llmsTxtDescription = '',
    spokesDir = null,
    inlineCategories = [],
    mdPathPlaceholder = 'LLM_MD_PATH_PLACEHOLDER',
    mdLinkId = 'llm-md-link',
    trimTitleSuffix = '',
  } = opts;

  // formatSubsectionName defaults to formatCategoryName so custom overrides
  // (e.g. 'oauth' → 'OAuth') carry over to sub-folder headings automatically.
  const formatSubsectionName = opts.formatSubsectionName ?? formatCategoryName;

  let siteUrl = '';

  return {
    name: 'astro-better-gen-markdown-pages',
    hooks: {
      'astro:config:done': ({ config }) => {
        siteUrl = (config.site || '').replace(/\/$/, '');
      },

      'astro:server:setup': ({ server }) => {
        const llmsTxtDevPath = '/' + llmsTxtPath;
        const llmsTxtDir = path.dirname(llmsTxtPath);
        const wellKnownDevPath =
          llmsTxtDir === '.'
            ? '/.well-known/llms.txt'
            : '/' + llmsTxtDir + '/.well-known/llms.txt';

        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '';

          if (url === llmsTxtDevPath || url === wellKnownDevPath) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            if (createLlmsTxt) {
              res.end(
                `# ${llmsTxtTitle} (Dev Mode)\n\nRun a production build to generate the full index.`
              );
            } else {
              res.end(
                `# (Dev Mode)\n\ncreateLlmsTxt is set to false, no llms.txt file will be generated.`
              );
            }
            return;
          }

          if (url.includes('?format=md')) {
            try {
              const route = url.split('?')[0];
              const devBase = `http://${req.headers.host}`;
              const response = await fetch(devBase + route);
              if (response.ok) {
                const html = await response.text();
                const devIndexUrl = configuredIndexUrl || `${devBase}/${llmsTxtPath}`;
                const { markdown } = htmlToMarkdown(html, {
                  siteUrl: devBase,
                  indexUrl: devIndexUrl,
                  trimTitleSuffix,
                });
                res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
                res.end(markdown);
                return;
              }
            } catch (err) {
              console.error(`[gen-markdown] Error generating MD for ${url}:`, err);
            }
          }

          next();
        });
      },

      'astro:build:done': async ({ dir, logger }) => {
        const log = (msg) => (logger ? logger.info(msg) : console.log(msg));
        log('[gen-markdown] Generating .md companion files...');

        const distDir = dir instanceof URL ? fileURLToPath(dir) : String(dir);
        const allHtmlFiles = walkHtml(distDir);
        const htmlFiles = pageFilter
          ? allHtmlFiles.filter(f => {
              const rel = path.relative(distDir, f).replace(/\\/g, '/');
              const mdRel = rel.endsWith('/index.html')
                ? rel.slice(0, -'/index.html'.length) + '.md'
                : rel.replace(/\.html$/, '.md');
              return pageFilter('/' + mdRel);
            })
          : allHtmlFiles;
        const resolvedIndexUrl =
          configuredIndexUrl || (siteUrl ? `${siteUrl}/${llmsTxtPath}` : '');

        const allResults = htmlFiles.length === 0 ? [] : (
          await getPool().run(htmlFiles, {
            distDir,
            siteUrl,
            indexUrl: resolvedIndexUrl,
            docsIndexUrl,
            mdPathPlaceholder,
            mdLinkId,
            trimTitleSuffix,
          })
        ).filter(Boolean);

        log(`[gen-markdown] Wrote ${allResults.length} .md files`);

        // Build category display-name → entries map
        // Each entry: { mdUrl, title, description, subParts, line }
        const categories = new Map();
        for (const { mdUrl, title, description } of allResults) {
          if (!indexFilter(mdUrl)) continue;
          const key = categorize(mdUrl);
          if (!key) continue;
          const displayName = formatCategoryName(key);
          if (!categories.has(displayName)) categories.set(displayName, []);
          const descText = description ? `: ${description}` : '';
          const line = `- [${title}](${siteUrl}${mdUrl})${descText}`;
          const subParts = getSubParts(mdUrl, key);
          categories.get(displayName).push({ mdUrl, title, description, subParts, line });
        }

        const sortedNames = sortCategories(Array.from(categories.keys()));

        let hub = `# ${llmsTxtTitle}\n\n`;
        if (llmsTxtDescription) hub += `> ${llmsTxtDescription}\n\n`;

        if (spokesDir) {
          const inlineSet = new Set(inlineCategories);

          for (const name of sortedNames) {
            const entries = categories.get(name);
            hub += `## ${name}\n\n`;

            if (inlineSet.has(name)) {
              // Inline categories: list all entries directly (no spoke file)
              hub += entries.map(e => e.line).join('\n') + '\n\n';
            } else {
              // Spoke categories: write spoke file, then in hub show index link + top-level pages only
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              const spokeFile = `llms-${slug}.txt`;
              const spokePath = path.join(distDir, spokesDir, spokeFile);
              const spokeUrl = `${siteUrl}/${spokesDir}/${spokeFile}`;

              fs.mkdirSync(path.dirname(spokePath), { recursive: true });
              fs.writeFileSync(spokePath, buildSpokeContent(name, entries, formatSubsectionName), 'utf-8');

              hub += `- [${name} index](${spokeUrl})\n`;

              // Root page (e.g. /docs/apis.md) — the section landing page
              const rootPage = entries.find(e => e.subParts.length === 0);
              if (rootPage) hub += rootPage.line + '\n';

              // Top-level files (e.g. /docs/apis/users.md) — one level deep, no sub-folder
              const topPages = entries.filter(e => e.subParts.length === 1);
              if (topPages.length > 0) hub += topPages.map(e => e.line).join('\n') + '\n';

              hub += '\n';
            }
          }

          // Append sibling-page section to each .md file
          for (const { mdUrl } of allResults) {
            if (!indexFilter(mdUrl)) continue;
            const key = categorize(mdUrl);
            if (!key) continue;
            const displayName = formatCategoryName(key);
            if (inlineSet.has(displayName)) continue;

            const allEntries = categories.get(displayName);
            if (!allEntries || allEntries.length <= 1) continue;

            const selfEntry = allEntries.find(e => e.mdUrl === mdUrl);
            if (!selfEntry) continue;

            const { subParts } = selfEntry;
            if (subParts.length === 0) continue; // root/landing page — skip sibling section

            const folderParts = subParts.slice(0, -1);
            const folderDepth = folderParts.length;

            let siblingEntries;
            let subsectionName;

            if (folderDepth === 0) {
              // Top-level file: siblings = other top-level files in same spoke
              siblingEntries = allEntries.filter(e => e.subParts.length === 1 && e.mdUrl !== mdUrl);
              subsectionName = displayName;
            } else {
              // File inside an H2/H3/H4 subsection: siblings = all entries sharing the same folder prefix
              siblingEntries = allEntries.filter(e => {
                if (e.mdUrl === mdUrl) return false;
                if (e.subParts.length < folderDepth) return false;
                return folderParts.every((seg, i) => e.subParts[i] === seg);
              });
              subsectionName = formatSubsectionName(folderParts[folderDepth - 1]);
            }

            if (!siblingEntries.length) continue;

            const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const spokeUrl = `${siteUrl}/${spokesDir}/llms-${slug}.txt`;

            const rel = mdUrl.startsWith('/') ? mdUrl.slice(1) : mdUrl;
            const mdFilePath = path.join(distDir, rel);
            if (!fs.existsSync(mdFilePath)) continue;

            const section = [
              '',
              '---',
              '',
              `## Other pages in ${subsectionName}`,
              '',
              `> For the full index of this section, see [${displayName}](${spokeUrl}).`,
              '',
              ...siblingEntries.map(e => e.line),
              '',
            ].join('\n');

            fs.appendFileSync(mdFilePath, section, 'utf-8');
          }
        } else {
          for (const name of sortedNames) {
            hub += `## ${name}\n\n${categories.get(name).map(e => e.line).join('\n')}\n\n`;
          }
        }

        if (createLlmsTxt) {
          const llmsAbsPath = path.join(distDir, llmsTxtPath);
          fs.mkdirSync(path.dirname(llmsAbsPath), { recursive: true });
          fs.writeFileSync(llmsAbsPath, hub, 'utf-8');

          // Mirror at .well-known/llms.txt alongside the hub
          const wellKnown = path.join(path.dirname(llmsAbsPath), '.well-known', 'llms.txt');
          fs.mkdirSync(path.dirname(wellKnown), { recursive: true });
          fs.writeFileSync(wellKnown, hub, 'utf-8');

          log(`[gen-markdown] llms.txt written`);
        } else {
          log(`[gen-markdown] createLlmsTxt is set to false, no llms.txt written`);
        }
      },
    },
  };
}
