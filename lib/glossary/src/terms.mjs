/**
 * The [[term]] and [[term::label]] syntax, shared by the Sätteri and remark plugins.
 */

import { COMPONENT_NAME } from './core.mjs';

const TERM_RE = /\[\[([^[\]]*?)(?:::([^[\]]*))?\]\]/g;
// a link can't nest in a link, and heading text feeds slugs and the TOC
export const FORBIDDEN_PARENTS = new Set(['heading', 'link', 'linkReference']);

function unknownTermMessage(glossary, name, label, help) {
  const withLabel = (id) => label ? `[[${id}::${label}]]` : `[[${id}]]`;
  const suggestions = glossary.suggest(name);
  return [
    `"${name}" isn't in the glossary.`,
    '',
    ...(suggestions.length
      ? ['If you misspelled the term, use one of these instead:', ...suggestions.map(id => `  ${withLabel(id)}`), '']
      : []),
    `If "${name}" is a new term, add an entry to ${glossary.file}:`,
    `  "${name}": { "definition": "One or two sentences.", "link": "/path/to/page" }`,
    ...(help ? ['', help] : []),
  ].join('\n');
}

/**
 * Splits a text value into text nodes and <AstroBetterGlossaryTerm> elements.
 * Returns null when the value holds no terms. `fail(snippet, message)` must throw.
 */
export function splitTerms(value, glossary, fail, help) {
  if (!value.includes('[[')) return null;
  const out = [];
  let last = 0;
  for (const match of value.matchAll(TERM_RE)) {
    const [raw, rawName, rawLabel] = match;
    const name = rawName.trim();
    const label = rawLabel?.trim();
    if (!name) fail(raw, 'The term name is empty. Write [[term]] or [[term::label]].');
    if (rawLabel !== undefined && !label) fail(raw, `The label after "::" is empty. Write [[${name}]] to show the term as written.`);
    const entry = glossary.find(name);
    if (!entry) fail(raw, unknownTermMessage(glossary, name, label, help));

    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    out.push({
      type: 'mdxJsxTextElement',
      name: COMPONENT_NAME,
      attributes: [{ type: 'mdxJsxAttribute', name: 'term', value: entry.id }],
      children: [{ type: 'text', value: label ?? name }],
    });
    last = match.index + raw.length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  const stray = out.find(n => n.type === 'text' && n.value.includes('[['));
  if (stray) fail(stray.value, 'Unclosed glossary term. Write [[term]] or [[term::label]]. For literal double brackets, use inline code.');
  return out;
}

export const forbiddenParentMessage = (type) => `Glossary terms can't go inside a ${type}. Move the term into the surrounding text.`;
