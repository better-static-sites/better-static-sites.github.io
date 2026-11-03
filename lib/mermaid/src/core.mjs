/**
 * Mermaid rendering shared by the unified and Sätteri adapters.
 *
 * IMPORTANT: mermaid must be imported at module-evaluation time — Vite's module
 * runner closes before remark callbacks fire, making dynamic imports impossible
 * inside the plugin body.
 */

import { createRequire } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const _require = createRequire(import.meta.url);

const TEXT_NODES = new Set(['text', 'tspan', 'textPath']);
const POSITION_ATTRS = ['x', 'y', 'dx', 'dy'];

// font size in px from the nearest style or font-size attribute; mermaid sets it on <text>
function fontSizeOf(el) {
  for (let node = el; node?.getAttribute; node = node.parentNode) {
    const fromStyle = /font-size:\s*([\d.]+)px/.exec(node.getAttribute('style') || '');
    if (fromStyle) return parseFloat(fromStyle[1]);
    const fromAttr = /^([\d.]+)(px)?$/.exec((node.getAttribute('font-size') || '').trim());
    if (fromAttr) return parseFloat(fromAttr[1]);
  }
  return 16;
}

const hasClass = (node, name) => (node.getAttribute?.('class') || '').split(/\s+/).includes(name);

// mermaid's stylesheet centers `.node .label text`, but svgdom ignores stylesheets when measuring
function inNodeLabel(el) {
  let label = false;
  for (let node = el.parentNode; node?.getAttribute; node = node.parentNode) {
    if (hasClass(node, 'label')) label = true;
    else if (label && hasClass(node, 'node')) return true;
  }
  return false;
}

const anchorOf = (text) => text.getAttribute('text-anchor')
  || /text-anchor:\s*(\w+)/.exec(text.getAttribute('style') || '')?.[1]
  || (inNodeLabel(text) ? 'middle' : 'start');

/** Make `el`'s text measure like the browser draws it; returns a function that undoes the changes. */
function browserTextLayout(el, measure) {
  let root = el;
  while (root.parentNode && TEXT_NODES.has(root.parentNode.nodeName)) root = root.parentNode;
  const nodes = [root, ...(root.querySelectorAll?.('text, tspan, textPath') ?? [])];
  const originals = [];
  const set = (node, attr, value) => {
    originals.push([node, attr, node.getAttribute(attr)]);
    node.setAttribute(attr, value);
  };

  // svgdom parseFloats "1.1em" line offsets to 1.1px, so multi-line labels measure one line tall
  for (const node of nodes) {
    for (const attr of POSITION_ATTRS) {
      const value = node.getAttribute?.(attr);
      if (!value || !value.includes('em')) continue;
      const size = fontSizeOf(node);
      set(node, attr, value.trim().split(/[\s,]+/).map(part =>
        part.endsWith('em') ? String(parseFloat(part) * size) : part
      ).join(' '));
    }
  }

  // browsers anchor each line as a whole but svgdom anchors each word's tspan, so place lines by hand
  for (const text of nodes.filter(node => node.nodeName === 'text')) {
    const anchor = anchorOf(text);
    if (anchor !== 'middle' && anchor !== 'end') continue;
    for (const node of [text, ...text.querySelectorAll('tspan')]) {
      if (node.getAttribute('text-anchor')) set(node, 'text-anchor', 'start');
      const style = node.getAttribute('style') || '';
      if (/text-anchor/.test(style)) set(node, 'style', style.replace(/text-anchor:\s*\w+;?/, ''));
    }
    const rows = [...text.childNodes].filter(node => node.nodeName === 'tspan' && node.getAttribute('x') !== null);
    for (const row of rows.length ? rows : [text]) {
      const x = parseFloat(row.getAttribute('x')) || 0;
      const { width } = measure.call(row);
      set(row, 'x', String(x - (anchor === 'middle' ? width / 2 : width)));
    }
  }

  return () => {
    for (const [node, attr, value] of originals.reverse()) {
      if (value === null) node.removeAttribute(attr); else node.setAttribute(attr, value);
    }
  };
}

function setupSvgdom() {
  let createSVGWindow;
  try { ({ createSVGWindow } = _require('svgdom')); } catch { return null; }

  const win = createSVGWindow();
  const doc = win.document;

  // svgdom creates SVG documents with no <body>; mermaid's d3 needs select("body").
  const body = doc.createElement('body');
  doc.documentElement.appendChild(body);
  Object.defineProperty(doc, 'body', { get: () => body, configurable: true });

  class CSSStyleSheet {
    constructor() { this.cssRules = []; }
    insertRule(rule) { this.cssRules.push({ cssText: rule }); }
  }

  // svgdom only implements SVG element geometry; mermaid calls this on HTML elements
  // to measure label text. Return a plausible box based on character count.
  if (win.HTMLElement) {
    win.HTMLElement.prototype.getBoundingClientRect = function () {
      const w = Math.max(50, (this.textContent || '').length * 8);
      return { width: w, height: 24, top: 0, left: 0, right: w, bottom: 24, x: 0, y: 0 };
    };
  }

  // svgdom's getBBox differs from a browser's in ways that break mermaid label layout
  const graphicsProto = win.SVGGraphicsElement?.prototype;
  if (graphicsProto?.getBBox) {
    const svgdomGetBBox = graphicsProto.getBBox;
    graphicsProto.getBBox = function () {
      const restore = browserTextLayout(this, svgdomGetBBox);
      try {
        const { x, y, width, height } = svgdomGetBBox.call(this);
        // shapes center text with (bbox.x - (bbox.left ?? 0)), which needs left/top absent like a browser rect
        return { x, y, width, height };
      } finally {
        restore();
      }
    };
  }

  win.location = new URL('http://localhost/');
  win.crypto = webcrypto;
  win.CSSStyleSheet = CSSStyleSheet;
  win.addEventListener    = () => {};
  win.removeEventListener = () => {};
  win.dispatchEvent       = () => false;
  win.getComputedStyle    = () => new Proxy({}, { get: () => '' });
  win.MutationObserver = class { observe(){} disconnect(){} takeRecords(){ return []; } };
  win.ResizeObserver   = class { observe(){} disconnect(){} };

  globalThis.window        = win;
  globalThis.document      = doc;
  globalThis.CSSStyleSheet = CSSStyleSheet;
  for (const k of ['SVGElement', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'Event']) {
    if (win[k]) globalThis[k] = win[k];
  }

  return { win, doc };
}

const domReady = setupSvgdom();

// Import mermaid at module-evaluation time — see file header.
const _mermaidImport = domReady
  ? import('mermaid').then(m => m.default).catch(err => {
      console.warn(`[astro-mermaid-ssr] Failed to import mermaid: ${err.message}`);
      return null;
    })
  : Promise.resolve(null);

// bump when cached entries change shape, so old ones miss (2: bare post-processed SVG, 3: svgdom text measurement fixes)
const CACHE_FORMAT = 3;

function mermaidVersion() {
  try { return _require('mermaid/package.json').version; } catch { return 'unknown'; }
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Wrap rendered SVG in the `<div class="mermaid">` the plugins emit as HTML. */
export function wrap(source, svg) {
  // &#10; keeps indentation intact through MDX raw parsing, which strips it after literal newlines
  const escapedSrc = source.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
  return `<div class="mermaid" data-processed="true" data-mermaid-src="${escapedSrc}">\n${svg}\n</div>`;
}

/** Undo the mermaid output quirks we can't fix through config. */
function postProcess(svg) {
  // `style X fill:#color` directives inject `fill:color !important` on cluster
  // background rects, blocking CSS theme overrides. Strip the !important and stash
  // the color in data-fill-color so CSS can override per theme.
  // Skip rects with a class attribute — those are node rects with intentional colors.
  svg = svg.replace(
    /(<rect\b[^>]*)\bstyle="fill:(#[0-9a-fA-F]{3,6})\s*!important([^"]*)"/g,
    (match, prefix, color, rest) => {
      if (/\bclass=/.test(prefix)) return match;
      return `${prefix}data-fill-color="${color.toLowerCase()}" style="fill:${color}${rest}"`;
    }
  );

  return svg;
}

/**
 * Create a renderer for one plugin instance.
 *
 * `render(source, index)` resolves to the post-processed SVG markup, or null
 * when the diagram fails (callers leave the code block as-is). `index` is the
 * diagram's position in its document; with the source hash it forms the SVG id,
 * so output is stable across builds and unique within a page.
 *
 * Rendered SVG is cached in memory and, unless `cache` is false, on disk under
 * `cacheDir`, keyed by mermaid version, options, id, and source.
 */
export function createRenderer({
  theme = 'default',
  securityLevel = 'loose',
  cache = true,
  cacheDir = path.join(process.cwd(), 'node_modules', '.cache', 'astro-better-mermaid'),
} = {}) {
  const mermaidReady = _mermaidImport.then(mermaid => {
    if (!mermaid) return null;
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel,
      htmlLabels: false, // svgdom loses innerHTML inside <foreignObject>; use SVG text
    });
    return mermaid;
  });

  const memo = new Map();
  const version = mermaidVersion();

  // mermaid keeps render state on the shared window, so renders must not overlap
  let queue = Promise.resolve();

  async function renderUncached(source, id, index) {
    const mermaid = await mermaidReady;
    if (!mermaid) return null;
    try {
      const { svg } = await mermaid.render(id, source);
      return postProcess(svg);
    } catch (err) {
      console.warn(`[astro-mermaid-ssr] Diagram ${index} failed to render.\n  ${err.message.slice(0, 120)}`);
      return null;
    }
  }

  return function render(source, index) {
    const id = `mermaid-ssr-${index}-${sha(source).slice(0, 6)}`;
    const key = sha(JSON.stringify([CACHE_FORMAT, version, theme, securityLevel, id, source]));
    if (memo.has(key)) return memo.get(key);

    const file = cache ? path.join(cacheDir, `${key}.svg`) : null;
    const result = queue.then(async () => {
      if (file) {
        try { return fs.readFileSync(file, 'utf-8'); } catch { /* miss */ }
      }
      const svg = await renderUncached(source, id, index);
      if (svg && file) {
        try {
          fs.mkdirSync(cacheDir, { recursive: true });
          // tmp + rename so concurrent builds never read a partial entry
          const tmp = `${file}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, svg, 'utf-8');
          fs.renameSync(tmp, file);
        } catch { /* cache is best-effort */ }
      }
      return svg;
    });
    queue = result.catch(() => {});
    // failures aren't memoized, so a later build retries them
    memo.set(key, result);
    result.then(svg => { if (!svg) memo.delete(key); }, () => memo.delete(key));
    return result;
  };
}

/** Title paragraph that mermaidTitleFix emits below a diagram, or null. */
export function titleNode(meta) {
  const titleMatch = (meta || '').match(/title=["'](.*?)["']/);
  if (!titleMatch) return null;
  const title = titleMatch[1];
  return {
    type: 'paragraph',
    data: {
      hName: 'p',
      hProperties: { 'data-title-bottom': title },
    },
    children: [{ type: 'text', value: title }],
  };
}
