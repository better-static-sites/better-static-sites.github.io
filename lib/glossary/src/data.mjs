/**
 * Glossary entries for components, from the integration's virtual module.
 *
 *   import { entries, findEntry, entryHref } from 'astro-better-glossary/data';
 */

import { entries, path } from 'virtual:astro-better-glossary';
import { buildLookup } from './core.mjs';

export { entries, path };

const lookup = buildLookup(entries);
const byId = new Map(entries.map(e => [e.id, e]));

/** The entry for a term name, alias, or abbreviation (case-insensitive), or undefined. */
export const findEntry = (name) => byId.get(lookup.get(name.trim().toLowerCase()));

/** The entry's anchor on the glossary page. */
export const entryHref = (entry) => `${path}#${entry.anchor}`;
