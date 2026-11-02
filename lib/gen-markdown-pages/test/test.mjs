import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, transformUrl } from '../src/convert.mjs';

// Wrap a fragment in a minimal HTML document with an article element
function doc(body, head = '') {
  return `<html><head>${head}</head><body><article>${body}</article></body></html>`;
}

// Convert and return just the markdown string
function convert(body, opts = {}) {
  return htmlToMarkdown(doc(body), opts).markdown;
}

// ── transformUrl ──────────────────────────────────────────────────────────────

test('transformUrl: external URL is unchanged', () => {
  assert.equal(
    transformUrl('https://other.com/foo', 'https://example.com'),
    'https://other.com/foo'
  );
});

test('transformUrl: root-relative path → absolute .md URL', () => {
  assert.equal(
    transformUrl('/docs/foo', 'https://example.com'),
    'https://example.com/docs/foo.md'
  );
});

test('transformUrl: path with file extension → unchanged', () => {
  assert.equal(
    transformUrl('/images/logo.png', 'https://example.com'),
    'https://example.com/images/logo.png'
  );
});

test('transformUrl: absolute internal URL → .md URL', () => {
  assert.equal(
    transformUrl('https://example.com/docs/bar', 'https://example.com'),
    'https://example.com/docs/bar.md'
  );
});

test('transformUrl: internal URL with fragment → fragment preserved', () => {
  assert.equal(
    transformUrl('/docs/page#section', 'https://example.com'),
    'https://example.com/docs/page.md#section'
  );
});

test('transformUrl: protocol-relative URL is treated as external', () => {
  assert.equal(
    transformUrl('//cdn.example.com/lib.js', 'https://example.com'),
    '//cdn.example.com/lib.js'
  );
});

test('transformUrl: no siteUrl → URL returned unchanged', () => {
  assert.equal(transformUrl('/docs/foo', ''), '/docs/foo');
});

// ── title and description extraction ─────────────────────────────────────────

test('title: extracted from og:title meta', () => {
  const { title } = htmlToMarkdown(
    doc('<p>content</p>', '<meta property="og:title" content="My Page Title">')
  );
  assert.equal(title, 'My Page Title');
});

test('title: extracted from <title> tag', () => {
  const { title } = htmlToMarkdown(
    doc('<p>content</p>', '<title>My Page | Site Name</title>')
  );
  assert.equal(title, 'My Page | Site Name');
});

test('title: trimTitleSuffix strips trailing site name', () => {
  const { title } = htmlToMarkdown(
    doc('<p>content</p>', '<title>My Page | Site Name</title>'),
    { trimTitleSuffix: ' | Site Name' }
  );
  assert.equal(title, 'My Page');
});

test('title: og:title takes precedence over <title>', () => {
  const { title } = htmlToMarkdown(
    doc(
      '<p>content</p>',
      '<meta property="og:title" content="OG Title"><title>Title Tag</title>'
    )
  );
  assert.equal(title, 'OG Title');
});

test('description: extracted from meta name="description"', () => {
  const { description } = htmlToMarkdown(
    doc('<p>content</p>', '<meta name="description" content="A short description.">')
  );
  assert.equal(description, 'A short description.');
});

// ── markdown structure ────────────────────────────────────────────────────────

test('title appears as h1 in markdown output', () => {
  const md = htmlToMarkdown(
    doc('<p>body text</p>', '<meta property="og:title" content="Hello">')
  ).markdown;
  assert.ok(md.includes('# Hello\n\n'), 'expected # Hello heading');
});

test('description appears below title', () => {
  const md = htmlToMarkdown(
    doc(
      '<p>body text</p>',
      '<meta property="og:title" content="T"><meta name="description" content="Desc.">'
    )
  ).markdown;
  assert.ok(md.includes('# T\n\nDesc.\n\n'), 'expected title then description');
});

test('indexUrl: preamble blockquote appears after title', () => {
  const md = htmlToMarkdown(
    doc('<p>body</p>', '<meta property="og:title" content="My Page">'),
    { indexUrl: 'https://example.com/llms.txt' }
  ).markdown;
  const titlePos = md.indexOf('# My Page');
  const preamblePos = md.indexOf('> For the index of this section of the site');
  assert.ok(titlePos !== -1, 'expected title');
  assert.ok(preamblePos !== -1, 'expected preamble');
  assert.ok(titlePos < preamblePos, 'title should appear before preamble');
});

test('indexUrl: preamble uses "site index" wording', () => {
  const md = convert('<p>body</p>', { indexUrl: 'https://example.com/llms.txt' });
  assert.ok(md.includes('For the index of this section of the site'), 'expected section index wording');
  assert.ok(!md.includes('For the complete documentation index'), 'old wording should not appear');
});

test('no indexUrl: no preamble blockquote', () => {
  const md = convert('<p>body</p>');
  assert.ok(!md.includes('For the complete'), 'unexpected preamble');
});

test('docsIndexUrl: second blockquote line added', () => {
  const md = convert('<p>body</p>', {
    indexUrl: 'https://example.com/blog/llms.txt',
    docsIndexUrl: 'https://example.com/docs/llms.txt',
  });
  assert.ok(md.includes('For the index of this section of the site'), 'expected section index line');
  assert.ok(md.includes('For the complete documentation index'), 'expected docs index line');
  assert.ok(md.includes('blog/llms.txt'), 'expected blog index url');
  assert.ok(md.includes('docs/llms.txt'), 'expected docs index url');
});

test('docsIndexUrl only (no indexUrl): single docs line shown', () => {
  const md = convert('<p>body</p>', { docsIndexUrl: 'https://example.com/docs/llms.txt' });
  assert.ok(!md.includes('For the complete site index'), 'site index line should not appear');
  assert.ok(md.includes('For the complete documentation index'), 'expected docs index line');
});

// ── link rules ────────────────────────────────────────────────────────────────

test('inline link: stays inline (no newlines added)', () => {
  const md = convert('<p>See <a href="/docs/foo">the docs</a> for details.</p>');
  assert.ok(md.includes('[the docs](/docs/foo)'), 'link should be present');
  // No blank lines before/after an inline link
  assert.ok(!md.match(/\n\n\[the docs\]/), 'inline link should not be block-wrapped');
});

test('card link (block children): gets blank-line padding', () => {
  // Surrounding <p> elements ensure Turndown doesn't strip leading/trailing newlines
  const md = convert(
    '<p>Intro text.</p>' +
    '<a href="/docs/card"><div>Card Title</div><div>Card description</div></a>' +
    '<p>Following text.</p>'
  );
  assert.ok(md.includes('[Card Title Card description](/docs/card)'), 'link text should be present');
  assert.ok(
    md.includes('\n\n[Card Title Card description](/docs/card)\n\n'),
    'card link should be surrounded by blank lines'
  );
});

test('multiple adjacent card links: separated by blank lines', () => {
  const md = convert(`
    <div>
      <a href="/docs/one"><div>Card One</div><p>Desc one</p></a>
      <a href="/docs/two"><div>Card Two</div><p>Desc two</p></a>
    </div>
  `);
  const oneIdx = md.indexOf('[Card One');
  const twoIdx = md.indexOf('[Card Two');
  assert.ok(oneIdx >= 0 && twoIdx >= 0, 'both card links should be present');
  // There should be at least one blank line between the two cards
  const between = md.slice(oneIdx, twoIdx);
  assert.ok(between.includes('\n\n'), 'adjacent cards should be separated by a blank line');
});

test('link with only a <strong> child: treated as inline', () => {
  const md = convert('<p><a href="/foo"><strong>Bold link</strong></a></p>');
  assert.ok(md.includes('[Bold link](/foo)'), 'bold link should be present');
  assert.ok(!md.match(/\n\n\[Bold link\]/), 'formatted inline link should not be block-wrapped');
});

test('empty link: omitted from output', () => {
  const md = convert('<a href="/foo"></a>');
  assert.ok(!md.includes('](/foo)'), 'empty link should be omitted');
});

// ── link URL transformation ───────────────────────────────────────────────────

test('internal link rewritten to .md when siteUrl is provided', () => {
  const md = convert('<a href="/docs/guide">Guide</a>', { siteUrl: 'https://example.com' });
  assert.ok(
    md.includes('[Guide](https://example.com/docs/guide.md)'),
    'internal link should be rewritten to .md'
  );
});

test('external link not rewritten', () => {
  const md = convert('<a href="https://other.com/page">External</a>', {
    siteUrl: 'https://example.com',
  });
  assert.ok(
    md.includes('[External](https://other.com/page)'),
    'external link should be unchanged'
  );
});

// ── tab labels ────────────────────────────────────────────────────────────────

test('tab label becomes h3 heading', () => {
  const md = convert('<label class="tab-label">My Tab</label><div>content</div>');
  assert.ok(md.includes('### My Tab'), 'tab label should become h3');
});

test('tab label: whitespace trimmed', () => {
  const md = convert('<label class="tab-label">  Trimmed  </label>');
  assert.ok(md.includes('### Trimmed'), 'tab label should be trimmed');
});

// ── code blocks ───────────────────────────────────────────────────────────────

test('code block: plain code gets a three-backtick fence', () => {
  const md = convert('<pre><code class="language-shell">echo hi\n</code></pre>');
  assert.ok(md.includes('```shell\necho hi\n```'), 'should use a ``` fence with the language');
});

test('code block: fence outgrows a fence at the start of a line', () => {
  const md = convert('<pre><code class="language-markdown">```shell\necho hi\n```\n</code></pre>');
  assert.ok(md.includes('````markdown\n```shell\necho hi\n```\n````'), 'outer fence should be longer than the inner one');
});

test('code block: fence outgrows an indented fence', () => {
  const code = '1. Run this:\n\n   ```shell\n   echo hi\n   ```\n\n1. Done.\n';
  const md = convert(`<pre><code class="language-markdown">${code}</code></pre>`);
  assert.ok(md.includes('````markdown\n1. Run this:'), 'outer fence should be longer than the indented inner one');
  assert.ok(md.includes('1. Done.\n````'), 'outer fence should close after the last line');
});

// ── mermaid recovery ──────────────────────────────────────────────────────────

test('mermaid SVG (data-mermaid-src) replaced with fenced code block', () => {
  const src = 'flowchart LR\n  A-->B';
  const md = convert(
    `<div class="mermaid" data-processed data-mermaid-src="${src.replace(/\n/g, '&#10;')}"><svg><text>rendered</text></svg></div>`
  );
  // The SVG content should be gone
  assert.ok(!md.includes('<svg>'), 'SVG should be removed');
  // The source code should appear in a mermaid code block
  assert.ok(md.includes('```mermaid') || md.includes('flowchart LR'), 'mermaid source should appear');
});

// ── noise removal ─────────────────────────────────────────────────────────────

test('script tags removed', () => {
  const md = convert('<p>Visible</p><script>alert("removed")</script>');
  assert.ok(!md.includes('alert'), 'script content should be removed');
  assert.ok(md.includes('Visible'), 'visible content should remain');
});

test('style tags removed', () => {
  const md = convert('<p>Visible</p><style>body{color:red}</style>');
  assert.ok(!md.includes('body{color:red}'), 'style content should be removed');
});

test('button elements removed', () => {
  const md = convert('<p>Text</p><button>Click me</button>');
  assert.ok(!md.includes('Click me'), 'button should be removed');
  assert.ok(md.includes('Text'), 'surrounding text should remain');
});

test('.hidden elements removed', () => {
  const md = convert('<p>Shown</p><div class="hidden">Hidden content</div>');
  assert.ok(!md.includes('Hidden content'), '.hidden element should be removed');
  assert.ok(md.includes('Shown'), 'visible content should remain');
});

test('[aria-hidden="true"] elements removed', () => {
  const md = convert('<p>Shown</p><span aria-hidden="true">Icon label</span>');
  assert.ok(!md.includes('Icon label'), 'aria-hidden element should be removed');
});

test('.sr-only elements removed', () => {
  const md = convert('<p>Shown</p><span class="sr-only">Screen reader text</span>');
  assert.ok(!md.includes('Screen reader text'), '.sr-only element should be removed');
});

test('[data-nomd] elements removed', () => {
  const md = convert('<p>Shown</p><div data-nomd><p>Excluded content</p></div>');
  assert.ok(!md.includes('Excluded content'), '[data-nomd] element should be removed');
  assert.ok(md.includes('Shown'), 'surrounding content should remain');
});

test('[data-markdown-ignore] elements removed', () => {
  const md = convert('<p>Shown</p><div data-markdown-ignore><p>Excluded content</p></div>');
  assert.ok(!md.includes('Excluded content'), '[data-markdown-ignore] element should be removed');
  assert.ok(md.includes('Shown'), 'surrounding content should remain');
});

// ── icon / svg accessibility ──────────────────────────────────────────────────

test('[role="img"][aria-label] replaced with label text', () => {
  const md = convert('<p>Click the <span role="img" aria-label="edit"><svg/></span> button.</p>');
  assert.ok(md.includes('edit'), 'aria-label text should appear in markdown');
  assert.ok(!md.includes('<span'), 'span should not appear as raw HTML');
});

test('SVG with <title> child replaced with title text', () => {
  const md = convert('<p>Click <svg><title>Add Item</title><path d="M0 0"/></svg> to continue.</p>');
  assert.ok(md.includes('Add Item'), 'SVG title text should appear in markdown');
});

test('bare SVG without accessible name is stripped silently', () => {
  const md = convert('<p>Before<svg><path d="M0 0"/></svg>After</p>');
  assert.ok(!md.includes('<svg'), 'bare SVG should not appear as raw HTML');
  assert.ok(md.includes('Before'), 'content before SVG should remain');
  assert.ok(md.includes('After'), 'content after SVG should remain');
});

// ── tab panels ────────────────────────────────────────────────────────────────

test('hidden tab panels are included (hidden class removed before conversion)', () => {
  const md = convert(
    '<div class="tab-panel hidden"><p>Tab content</p></div>'
  );
  assert.ok(md.includes('Tab content'), 'tab panel content should be included despite being hidden');
});

// ── empty / edge cases ────────────────────────────────────────────────────────

test('page with no article/main/body returns empty string', () => {
  const { markdown } = htmlToMarkdown('');
  assert.equal(markdown, '');
});

test('page with empty article returns empty markdown', () => {
  const { markdown } = htmlToMarkdown('<html><body><article></article></body></html>');
  assert.equal(markdown, '');
});
