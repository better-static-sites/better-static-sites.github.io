/**
 * Evaluate MDX through @mdx-js/mdx (the unified pipeline Astro uses, including
 * its rehype-raw step) and through Sätteri, with a tiny JSX runtime that builds
 * hast, so the two outputs can be compared as trees.
 */

import { evaluate as evaluateUnified, nodeTypes } from '@mdx-js/mdx';
import { evaluate as evaluateSatteri } from 'satteri';
import rehypeRaw from 'rehype-raw';
import { fromHtml } from 'hast-util-from-html';
import { removePosition } from 'unist-util-remove-position';
import { find, html as htmlSchema, svg as svgSchema } from 'property-information';

const Fragment = Symbol('Fragment');

// Astro copies code meta into properties before rehype-raw, which drops `data`
function rehypeMetaString() {
  const walk = (node) => {
    if (node.tagName === 'code' && node.data?.meta) node.properties = { ...node.properties, metastring: node.data.meta };
    node.children?.forEach(walk);
  };
  return walk;
}

function kids(children) {
  return [children].flat(Infinity).filter(c => c != null && c !== false && c !== true)
    .flatMap(c => (typeof c === 'object' ? (c.type === 'root' ? c.children : [c]) : [{ type: 'text', value: String(c) }]));
}

// hast property names (className, strokeWidth) to the attribute names JSX props use
function toAttributes(node, space = 'html') {
  if (node.type !== 'element') return node;
  const inner = node.tagName === 'svg' ? 'svg' : space;
  const schema = inner === 'svg' ? svgSchema : htmlSchema;
  const properties = {};
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    const info = find(schema, key);
    properties[info.attribute] = Array.isArray(value) ? value.join(info.commaSeparated ? ', ' : ' ') : value === true ? '' : String(value);
  }
  return { ...node, properties, children: node.children.map(c => toAttributes(c, inner)) };
}

function jsx(type, props = {}) {
  const { children: given, 'set:html': setHtml, ...properties } = props;
  // Astro's set:html replaces the element's children with parsed HTML
  const parsed = setHtml === undefined ? null : fromHtml(setHtml, { fragment: true });
  if (parsed) removePosition(parsed, { force: true });
  const children = parsed ? parsed.children.map(c => toAttributes(c)) : given;
  if (type === Fragment) return { type: 'root', children: kids(children) };
  if (typeof type === 'function') return type(props);
  return { type: 'element', tagName: type, properties, children: kids(children) };
}

// mdx-js emits style objects (Astro serializes them to CSS), Sätteri emits CSS strings
function styleMap(style) {
  if (typeof style !== 'string') return style;
  const camel = (k) => k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return Object.fromEntries(style.split(';').filter(d => d.includes(':'))
    .map(d => [camel(d.slice(0, d.indexOf(':'))), d.slice(d.indexOf(':') + 1).trim()]));
}

// merge adjacent text, drop whitespace-only text outside pre/code/style
function normalize(node, keepSpace = false) {
  if (node.properties?.style !== undefined) node.properties = { ...node.properties, style: styleMap(node.properties.style) };
  // metastring is Astro's carrier for code meta, not plugin output
  if (node.properties && 'metastring' in node.properties) { const { metastring, ...rest } = node.properties; node.properties = rest; }
  // class is a token list, so surrounding and repeated spaces don't matter
  if (typeof node.properties?.class === 'string') node.properties.class = node.properties.class.trim().split(/\s+/).join(' ');
  if (!node.children) return node;
  const keep = keepSpace || ['pre', 'code', 'style'].includes(node.tagName);
  const out = [];
  for (const c of node.children.map(c => normalize(c, keep))) {
    const prev = out[out.length - 1];
    if (c.type === 'text' && prev?.type === 'text') prev.value += c.value;
    else out.push({ ...c });
  }
  node.children = keep ? out : out.filter(c => c.type !== 'text' || c.value.trim() !== '');
  return node;
}

const runtime = { Fragment, jsx, jsxs: jsx, elementAttributeNameCase: 'html' };

export async function unifiedTree(source, { remarkPlugins = [], rehypePlugins = [], components } = {}) {
  const { default: Content } = await evaluateUnified(source, {
    ...runtime,
    remarkPlugins,
    rehypePlugins: [rehypeMetaString, [rehypeRaw, { passThrough: nodeTypes }], ...rehypePlugins],
  });
  return normalize(Content({ components }));
}

export async function satteriTree(source, { mdastPlugins = [], hastPlugins = [], components } = {}) {
  const { default: Content } = await evaluateSatteri(source, { ...runtime, mdastPlugins, hastPlugins });
  return normalize(Content({ components }));
}
