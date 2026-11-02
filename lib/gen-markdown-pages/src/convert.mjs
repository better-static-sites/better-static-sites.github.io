import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const BLOCK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'figure', 'blockquote', 'ul', 'ol']);

export function createConverter() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  td.use(gfm);

  td.addRule('links', {
    filter: (node) => node.nodeName === 'A' && !!node.getAttribute('href'),
    replacement: (content, node) => {
      const href = node.getAttribute('href');
      if (!href) return content;
      // Derive text from the Turndown-converted content rather than node.textContent.
      // node.textContent loses spacing when adjacent block children like <div> have no
      // whitespace text node between them (e.g. card components mash "TitleDesc" together).
      // Turndown's content already has \n\n between those blocks, so replacing them with
      // spaces gives proper spacing: "Title\n\nDesc" → "Title Desc".
      const text = content
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // unwrap nested link/image text
        .replace(/[`*#_~]/g, '')                    // strip inline markdown markers
        .replace(/\n+/g, ' ')                     // block-children newlines → space
        .trim()
        .replace(/\s+/g, ' ');
      if (!text) return '';
      return `[${text}](${href})`;
    },
  });

  // turndown only lengthens the fence past runs at column 0, but an indented run can also close it
  td.addRule('fencedCodeBlock', {
    filter: (node, options) =>
      options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
    replacement: (content, node, options) => {
      const language = ((node.firstChild.getAttribute('class') || '').match(/language-(\S+)/) || [])[1] || '';
      const code = node.firstChild.textContent;
      const fenceChar = options.fence.charAt(0);
      const runs = code.match(new RegExp(`^[ \\t]*${fenceChar}{3,}`, 'gm')) || [];
      const fence = fenceChar.repeat(Math.max(2, ...runs.map((run) => run.trim().length)) + 1);
      return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
    },
  });

  td.addRule('tabLabels', {
    filter: (node) =>
      node.nodeName === 'LABEL' && (node.getAttribute('class') || '').includes('tab-label'),
    replacement: (content) => `\n### ${content.trim()}\n\n`,
  });

  return td;
}

export function transformUrl(url, siteUrl) {
  if (!siteUrl) return url;
  // Absolutize root-relative URLs (but not protocol-relative like //cdn.example.com)
  if (url.startsWith('/') && !url.startsWith('//')) url = siteUrl + url;
  // Leave external links alone
  if (!url.startsWith(`${siteUrl}/`)) return url;
  const hashIdx = url.indexOf('#');
  const fragment = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const bare = (hashIdx >= 0 ? url.slice(0, hashIdx) : url).replace(/\/$/, '');
  const lastSegment = bare.split('/').pop() || '';
  // Add .md only when the last segment has no file extension
  return lastSegment.includes('.') ? url : `${bare}.md${fragment}`;
}

/**
 * Convert an HTML page to LLM-friendly markdown.
 *
 * Returns { markdown, title, description } where title and description
 * are extracted from the page's meta tags for use in index files.
 *
 * @param {string} html
 * @param {object} [opts]
 * @param {string} [opts.siteUrl]          Base URL for rewriting internal links (e.g. 'https://example.com')
 * @param {string} [opts.indexUrl]         URL linked in the top preamble (e.g. 'https://example.com/llms.txt')
 * @param {TurndownService} [opts.converter]  Pre-built converter; pass one to avoid re-initializing per call
 * @param {string} [opts.trimTitleSuffix]  Trailing substring to strip from extracted page titles
 *   (e.g. ' | My Site'). Matched exactly and case-sensitively after trimming. Useful when your
 *   HTML `<title>` and `og:title` include a site-name suffix that should not appear in llms.txt
 *   link text or .md headings.
 * @param {string} [opts.docsIndexUrl]  When set, a second blockquote line is appended to the
 *   preamble pointing to the full documentation index (e.g. for blog/article pages).
 */
export function htmlToMarkdown(html, opts = {}) {
  const { siteUrl = '', indexUrl = '', converter, trimTitleSuffix = '', docsIndexUrl = '' } = opts;
  const td = converter ?? createConverter();
  const root = parse(html);

  const container =
    root.querySelector('article') ??
    root.querySelector('main') ??
    root.querySelector('body');
  if (!container) return { markdown: '', title: '', description: '' };

  const rawTitle =
    root.querySelector('meta[name="markdown-title"]')?.getAttribute('content') ||
    root.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    root.querySelector('title')?.textContent?.trim() ||
    '';
  const title =
    trimTitleSuffix && rawTitle.endsWith(trimTitleSuffix)
      ? rawTitle.slice(0, -trimTitleSuffix.length).trimEnd()
      : rawTitle;
  const description =
    root.querySelector('meta[name="description"]')?.getAttribute('content') || '';

  // Reveal hidden tab panels and markdown-only elements so their content is included
  container.querySelectorAll('.tab-panel, [data-mdonly]').forEach(el => el.classList.remove('hidden'));

  // Swap SSR-rendered mermaid diagrams back to fenced code blocks
  container.querySelectorAll('[data-mermaid-src]').forEach(el => {
    const src = el.getAttribute('data-mermaid-src');
    if (src) {
      const escaped = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      el.replaceWith(parse(`<pre><code class="language-mermaid">${escaped}</code></pre>`).firstChild);
    }
  });

  // Convert .aside callout divs to blockquotes so Turndown emits "> " prefix.
  // The .aside-title div (icon + type label) is discarded; type is read from the class name.
  // Inject "TYPE: " inline into the first <p> of the content so there's no blank-line gap.
  container.querySelectorAll('.aside').forEach(el => {
    const cls = el.getAttribute('class') || '';
    const match = cls.match(/\baside-(\w+)\b/);
    const type = match ? match[1] : 'note';
    const contentDiv = el.querySelector('.aside-content');
    const inner = contentDiv ? contentDiv.innerHTML : '';
    const label = `<strong>${type.toUpperCase()}:</strong> `;
    const body = /^\s*<p(?:\s[^>]*)?>/i.test(inner)
      ? inner.replace(/^(\s*<p(?:\s[^>]*)?>)/i, `$1${label}`)
      : `<p>${label}</p>${inner}`;
    el.replaceWith(parse(`<blockquote>${body || `<p>${label}</p>`}</blockquote>`).firstChild);
  });

  // Restructure .api-field-row: field name stays as <code>, remaining badges become <ul> bullets.
  container.querySelectorAll('.api-field-row').forEach(row => {
    let nameHtml = '';
    const attrTexts = [];
    for (const child of row.childNodes) {
      if (!child.tagName) continue; // skip text nodes
      const cls = child.getAttribute('class') || '';
      if (cls.includes('api-field-name')) {
        nameHtml = child.outerHTML;
      } else {
        const text = (child.textContent || '').trim();
        if (text) attrTexts.push(text);
      }
    }
    if (!nameHtml) return;
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const items = attrTexts.map(t => `<li>${esc(t)}</li>`).join('');
    row.innerHTML = attrTexts.length
      ? `${nameHtml}<ul>${items}</ul>`
      : nameHtml;
  });

  // Collapse the API method/URI bar into a single clean code span using data attributes.
  container.querySelectorAll('[data-toc-type="api"]').forEach(el => {
    const method = el.getAttribute('data-toc-method') || '';
    const path = el.getAttribute('data-toc-text') || '';
    if (method && path) el.replaceWith(parse(`<p><code>${method} ${path}</code></p>`).firstChild);
  });

  // Wrap card-style <a> elements (those with block-level direct children) in a <div>.
  // Turndown treats <a> as inline and strips surrounding blank lines; the <div> wrapper
  // makes Turndown emit \n\n before and after each card, so adjacent cards are separated.
  container.querySelectorAll('a[href]').forEach(el => {
    const hasBlock = el.childNodes.some(n => BLOCK_TAGS.has(n.tagName?.toLowerCase()));
    if (hasBlock) {
      const div = parse('<div></div>').firstChild;
      el.replaceWith(div);
      div.appendChild(el);
    }
  });

  // Rescue accessible text from icon/image elements before stripping SVGs.
  // ARIA pattern: role="img" + aria-label means "this element is an image with this label."
  container.querySelectorAll('[role="img"][aria-label]').forEach(el => {
    const label = el.getAttribute('aria-label');
    if (label) el.replaceWith(label);
  });

  // SVG accessibility: a <title> child element names the SVG for screen readers.
  container.querySelectorAll('svg').forEach(el => {
    if (!el.parentNode) return; // already replaced by [role="img"] pass above
    const titleText = el.querySelector('title')?.textContent?.trim();
    if (titleText) { el.replaceWith(titleText); return; }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) el.replaceWith(ariaLabel);
    else el.remove();
  });

  container
    .querySelectorAll(
      'script, style, svg, button, nav, footer, aside, ' +
      '.not-prose.hidden, [aria-hidden="true"], .hidden, .sr-only, dialog, noscript, ' +
      '[data-nomd], [data-markdown-ignore]'
    )
    .forEach(el => el.remove());

  const rawHtml = container.innerHTML;
  if (!rawHtml) return { markdown: '', title, description };

  const body = td
    .turndown(rawHtml)
    .replace(/\]\(([^)]+)\)/g, (_, url) => `](${transformUrl(url, siteUrl)})`);

  let markdown = '';
  if (title) markdown += `# ${title}\n\n`;
  if (description) markdown += `${description}\n\n`;
  if (indexUrl || docsIndexUrl) {
    if (indexUrl) markdown += `> For the index of this section of the site, see [llms.txt](${indexUrl})\n`;
    if (indexUrl && docsIndexUrl) markdown += `>\n`;
    if (docsIndexUrl) markdown += `> For the complete documentation index, see [llms.txt](${docsIndexUrl})\n`;
    markdown += '\n';
  }
  markdown += body;

  return { markdown, title, description };
}
