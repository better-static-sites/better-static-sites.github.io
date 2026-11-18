/**
 * Loads and validates a glossary JSON file, and resolves names, aliases, and
 * abbreviations to entries. Used at config time by the markdown plugins and the
 * integration; components read the result through a virtual module.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { slug } from 'github-slugger';
import { Marked } from 'marked';

const FIELDS = new Set(['definition', 'link', 'abbreviations', 'aliases', 'standards']);
const DEFAULT_LINK = /^(\/|https:\/\/)/;

export const COMPONENT_NAME = 'AstroBetterGlossaryTerm';
export const COMPONENT_PATH = 'astro-better-glossary/GlossaryTerm.astro';

// definitions allow inline markdown: links, code, bold, and italics
const inline = new Marked();
// keyboard focus can't reach a tooltip, so tooltips show link text only
const inlineNoLinks = new Marked({ renderer: { link({ tokens }) { return this.parser.parseInline(tokens); } } });

const sortKey = (id) => id.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Lowercased name, alias, or abbreviation to canonical id. Shared with the components. */
export function buildLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    for (const name of [entry.id, ...(entry.aliases ?? []), ...(entry.abbreviations ?? [])]) {
      lookup.set(name.toLowerCase(), entry.id);
    }
  }
  return lookup;
}

function validate(id, entry, { file, fields, linkPattern, validateEntry }) {
  const fail = (msg) => { throw new Error(`[astro-better-glossary] "${id}" in ${file}: ${msg}`); };
  for (const key of Object.keys(entry)) if (!FIELDS.has(key) && !fields.includes(key)) fail(`unknown field "${key}"`);
  if (typeof entry.definition !== 'string' || !entry.definition.trim()) fail('"definition" is required');
  if (typeof entry.link !== 'string' || !linkPattern.test(entry.link)) fail(`"link" must match ${linkPattern}`);
  for (const key of ['abbreviations', 'aliases']) {
    if (entry[key] !== undefined && !(Array.isArray(entry[key]) && entry[key].every(s => typeof s === 'string'))) fail(`"${key}" must be an array of strings`);
  }
  if (entry.standards !== undefined && !(Array.isArray(entry.standards) && entry.standards.every(s => s?.name && s?.url))) {
    fail('"standards" must be an array of { name, url }');
  }
  const message = validateEntry?.(id, entry);
  if (message) fail(message);
}

const cache = new Map();

/**
 * Options:
 *   file           path to the glossary JSON, relative to the project root (required)
 *   path           URL of the glossary page, such as '/glossary' (required)
 *   fields         extra entry fields to allow, such as ['status']
 *   linkPattern    RegExp every entry link must match (default: root-relative or https)
 *   validateEntry  (id, entry) => error message or undefined, for the extra fields
 *   root           project root (default: process.cwd())
 */
export function loadGlossary(options, { fresh = false } = {}) {
  const { file, path, fields = [], linkPattern = DEFAULT_LINK, validateEntry, root = process.cwd() } = options ?? {};
  if (!file) throw new Error('[astro-better-glossary] the `file` option is required');
  if (!path) throw new Error('[astro-better-glossary] the `path` option is required');
  const abs = resolve(root, file);
  if (!fresh && cache.has(abs)) return cache.get(abs);

  const raw = JSON.parse(readFileSync(abs, 'utf-8'));
  const seen = new Map();
  for (const [id, entry] of Object.entries(raw)) {
    validate(id, entry, { file, fields, linkPattern, validateEntry });
    for (const name of [id, ...(entry.aliases ?? []), ...(entry.abbreviations ?? [])]) {
      const key = name.toLowerCase();
      if (seen.has(key) && seen.get(key) !== id) {
        throw new Error(`[astro-better-glossary] "${name}" names both "${seen.get(key)}" and "${id}" in ${file}`);
      }
      seen.set(key, id);
    }
  }

  const entries = Object.entries(raw)
    .map(([id, entry]) => ({
      id,
      anchor: slug(id),
      ...entry,
      definitionHtml: inline.parseInline(entry.definition),
      tooltipHtml: inlineNoLinks.parseInline(entry.definition),
    }))
    .sort((a, b) => sortKey(a.id).localeCompare(sortKey(b.id)));

  const lookup = buildLookup(entries);
  const byId = new Map(entries.map(e => [e.id, e]));
  const glossary = {
    file,
    abs,
    path: path.replace(/\/$/, ''),
    entries,
    lookup,
    find: (name) => byId.get(lookup.get(name.trim().toLowerCase())),
    suggest: (name) => suggest(lookup, name),
  };
  cache.set(abs, glossary);
  return glossary;
}

// optimal string alignment distance: a swap of adjacent letters counts as one edit
function editDistance(a, b) {
  let prev2 = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Up to 3 canonical ids that look like a misspelling of, or contain, `name`. */
function suggest(lookup, name) {
  const needle = name.trim().toLowerCase();
  const best = new Map();
  for (const [key, id] of lookup) {
    const contains = Math.min(key.length, needle.length) >= 4 && (key.includes(needle) || needle.includes(key));
    const score = contains ? 1 : editDistance(needle, key);
    if (score <= Math.max(2, Math.floor(needle.length / 4)) && score < (best.get(id) ?? Infinity)) best.set(id, score);
  }
  return [...best].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([id]) => id);
}
