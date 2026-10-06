/**
 * Code block logic shared by the unified and satteri adapters.
 *
 * Nothing here walks a tree. Each adapter finds the `pre > code` nodes its own
 * way and hands the language, meta string, and text to `buildCodeBlock`, which
 * returns the replacement hast node.
 */

import { fromHtml } from 'hast-util-from-html';
import { removePosition } from 'unist-util-remove-position';
import { runHighlighterWithAstro } from '@astrojs/prism/dist/highlighter';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-shell-session.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-jsx.js';

export const DEFAULT_EXCLUDE = ['mermaid'];

/** Parse "{1,3-5}" -> Set of 1-based line numbers */
function parseRanges(spec) {
  const lines = new Set();
  if (!spec) return lines;
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2] ?? m[1], 10);
    for (let i = start; i <= end; i++) lines.add(i);
  }
  return lines;
}

function parseMeta(meta) {
  if (!meta) return { highlight: new Set(), collapse: new Set(), diff: false, title: null, escape: false };
  const hMatch = meta.match(/\{([^}]+)\}/);
  const cMatch = meta.match(/\[([^\]]+)\]/);
  const tMatch = meta.match(/title="([^"]+)"/);
  return {
    highlight: parseRanges(hMatch?.[1]),
    collapse: parseRanges(cMatch?.[1]),
    diff: /\bdiff\b/.test(meta),
    title: tMatch?.[1] ?? null,
    escape: /\bescape\b/.test(meta),
  };
}


/**
 * Split hast nodes on newlines, one array of children per line.
 * Recurses into element children so Prism tokens that span multiple lines
 * (e.g. multi-line HTML attribute lists) are split per line rather than
 * placed wholesale on the first line with the rest lost.
 */
function splitNodes(nodes) {
  const segs = [[]];
  for (const node of nodes) {
    if (node.type === 'text') {
      const parts = node.value.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) segs.push([]);
        if (parts[i]) segs[segs.length - 1].push({ type: 'text', value: parts[i] });
      }
    } else if (node.type === 'element' && node.children?.length) {
      const inner = splitNodes(node.children);
      for (let i = 0; i < inner.length; i++) {
        if (i > 0) segs.push([]);
        if (inner[i].length) segs[segs.length - 1].push({ ...node, children: inner[i] });
      }
    } else {
      segs[segs.length - 1].push(node);
    }
  }
  return segs;
}

function splitIntoLines(children) {
  const segs = splitNodes(children);
  // drop trailing empty segment (code blocks typically end with \n)
  if (segs.length && segs[segs.length - 1].length === 0) segs.pop();
  return segs;
}

function getLineText(lineChildren) {
  let text = '';
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type === 'text') text += n.value;
      else if (n.children) walk(n.children);
    }
  };
  walk(lineChildren);
  return text;
}

function buildLineNodes(rawLines, highlight, collapse, diff) {
  const nodes = [];
  let collapseStart = null;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNum = i + 1;
    const lineChildren = rawLines[i];
    const isHighlighted = highlight.has(lineNum);
    const isCollapsed = collapse.has(lineNum);

    const classes = ['line'];
    if (isHighlighted) classes.push('line-highlighted');
    if (isCollapsed) classes.push('line-collapsed');

    if (diff) {
      const text = getLineText(lineChildren);
      if (/^[+]/.test(text)) classes.push('diff-inserted');
      else if (/^[-]/.test(text)) classes.push('diff-deleted');
    }

    if (isCollapsed && collapseStart === null) {
      collapseStart = lineNum;
      let count = 0;
      for (let j = lineNum; j <= rawLines.length && collapse.has(j); j++) count++;
      nodes.push({
        type: 'element',
        tagName: 'span',
        properties: { className: ['line', 'line-collapse-toggle'], 'data-count': String(count) },
        children: [{ type: 'text', value: `${count} hidden line${count === 1 ? '' : 's'}` }],
      });
    }
    if (!isCollapsed) collapseStart = null;

    nodes.push({
      type: 'element',
      tagName: 'span',
      properties: { className: classes },
      children: lineChildren,
    });
  }

  return nodes;
}

/** Add data-no-copy to shell-symbol.important tokens, and the space after them, so the copy button skips both */
function markShellPrompts(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (
      n.type === 'element' &&
      Array.isArray(n.properties?.className) &&
      n.properties.className.includes('shell-symbol')
    ) {
      n.properties['data-no-copy'] = '';
      const next = nodes[i + 1];
      const space = next?.type === 'text' ? next.value.match(/^[ \t]+/)?.[0] : undefined;
      if (space) {
        // still rendered, just not copied
        const rest = next.value.slice(space.length);
        const marked = { type: 'element', tagName: 'span', properties: { 'data-no-copy': '' }, children: [{ type: 'text', value: space }] };
        nodes.splice(i + 1, 1, marked, ...(rest ? [{ type: 'text', value: rest }] : []));
        i++;
      }
    }
    if (n.children?.length) markShellPrompts(n.children);
  }
}

// Prism component names for common aliases (sh→bash, ts→typescript, etc.)
const LANG_ALIASES = { sh: 'bash', zsh: 'bash', ts: 'typescript', md: 'markdown', mdx: 'jsx', astro: 'jsx' };

/** Read the `language-*` class off a `code` element, or 'plaintext'. */
export function getLanguage(codeNode) {
  const classList = codeNode.properties?.className ?? [];
  const classes = Array.isArray(classList) ? classList : [classList];
  const langClass = classes.find(c => typeof c === 'string' && c.startsWith('language-'));
  return langClass?.slice('language-'.length) ?? 'plaintext';
}

/** Meta string of a `code` element, wherever the pipeline put it. */
export function getMeta(codeNode) {
  return codeNode.data?.meta ?? codeNode.properties?.metastring ?? '';
}

/**
 * Build the hast node that replaces a `pre` block.
 *
 * @param {{ language: string, meta: string, code: string }} block
 * @param {{ copyButton?: boolean, titlePosition?: 'top' | 'bottom' }} [opts]
 */
export async function buildCodeBlock({ language, meta, code }, { copyButton = true, titlePosition = 'top' } = {}) {
  const { highlight, collapse, diff, title, escape } = parseMeta(meta);

  let resultNode;

  if (escape) {
    // Highlight with JSX grammar. Prism HTML-escapes < and > within token
    // spans, so component tags like <Tabs> display as literal text instead
    // of rendering. data-language preserves the declared language label.
    const { html, classLanguage } = await runHighlighterWithAstro('jsx', code);
    const fragment = fromHtml(
      `<pre class="${classLanguage}" data-language="${language}"><code class="${classLanguage}">${html}</code></pre>`,
      { fragment: true }
    );
    removePosition(fragment, { force: true });
    resultNode = fragment.children[0];
  } else {
    const prismLang = LANG_ALIASES[language] ?? language;
    const { html, classLanguage } = await runHighlighterWithAstro(prismLang, code);

    const fragment = fromHtml(
      `<pre class="${classLanguage}" data-language="${language}"><code class="${classLanguage}">${html}</code></pre>`,
      { fragment: true }
    );
    removePosition(fragment, { force: true });
    const newPre = fragment.children[0];
    const newCode = newPre.children[0];

    if (highlight.size > 0 || collapse.size > 0 || diff) {
      const rawLines = splitIntoLines(newCode.children);
      newCode.children = buildLineNodes(rawLines, highlight, collapse, diff);
      newPre.properties['data-has-line-meta'] = 'true';
    }

    if (language === 'shell-session') {
      markShellPrompts(newCode.children);
    }

    resultNode = newPre;
  }

  // Build the replacement node: optionally wrap with copy button, then title
  if (copyButton) {
    resultNode = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['ccb-wrapper'] },
      children: [
        resultNode,
        { type: 'element', tagName: 'copy-code-button', properties: {}, children: [] },
      ],
    };
  }

  if (title) {
    const figcaption = {
      type: 'element',
      tagName: 'figcaption',
      properties: { className: ['code-title'] },
      children: [{ type: 'text', value: title }],
    };
    resultNode = {
      type: 'element',
      tagName: 'figure',
      properties: { className: ['code-figure'] },
      children: titlePosition === 'bottom'
        ? [resultNode, figcaption]
        : [figcaption, resultNode],
    };
  }

  return resultNode;
}

/**
 * Prepend `prompt` to shell-session lines that have none, so Prism's
 * shell-session grammar can tokenize them. Continuation lines (after a
 * trailing backslash or inside an open single quote) are left alone.
 */
export function addShellPrompts(value, prompt = '$ ') {
  const lines = value.split('\n');
  let continuation = false;
  let openQuote = false;

  return lines.map(line => {
    // empty lines reset all state
    if (!line.trim()) {
      continuation = false;
      openQuote = false;
      return line;
    }

    const isContinuation = continuation || openQuote;

    // update state from this line's content
    const endsWithBackslash = line.trimEnd().endsWith('\\');
    // count unescaped single quotes to track whether a quoted argument spans lines
    const quoteCount = (line.match(/'/g) || []).length;
    openQuote = openQuote !== (quoteCount % 2 === 1);
    continuation = endsWithBackslash;

    if (isContinuation) return line;
    if (line.startsWith('$ ') || line.startsWith('# ')) return line;
    return prompt + line;
  }).join('\n');
}
