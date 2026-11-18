/**
 * Page-side half of astro-better-og-images. Astro bundles page code separately
 * from the integration, so the two share state through globalThis.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_KEY = Symbol.for('astro-better-og-images');

const RASTER = /\.(png|jpe?g|webp|avif)$/i;
const sourceHashes = new Map();

const hash = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);

const contentHash = (file) => {
  let h = sourceHashes.get(file);
  if (!h) {
    h = createHash('sha256').update(readFileSync(file)).digest('hex');
    sourceHashes.set(file, h);
  }
  return h;
};

/**
 * The Open Graph image for a page, as { url, alt, type, width, height }. `url`
 * is root-relative; make it absolute with `new URL(og.url, Astro.url)`.
 *
 *   title   the page title, without a site suffix
 *   label   optional text above the title, such as the section name
 *   source  optional path in public/ to the page's own image; raster images get
 *           a resized copy, anything else gets a title card. An absolute URL is
 *           used as is.
 *   alt     optional alt text; the default describes the card
 */
export async function getOgImage({ title, label = '', source, alt }) {
  if (source && /^https?:/.test(source)) return { url: source, alt: alt ?? title };
  const state = globalThis[STATE_KEY];
  if (!state) throw new Error('[astro-better-og-images] add the ogImages() integration to astro.config');

  const sourceFile = source && RASTER.test(source) ? join(state.publicDir, source) : undefined;
  if (sourceFile && existsSync(sourceFile)) {
    const url = `${state.route}/${hash(state.version, contentHash(sourceFile))}.jpg`;
    state.enqueue(url, { title, label, source: sourceFile });
    return { url, alt: alt ?? title, type: 'image/jpeg', width: 1200, height: 630 };
  }

  const url = `${state.route}/${hash(state.version, title, label)}.png`;
  state.enqueue(url, { title, label });
  // the card shows the site name, the label, and the title; skip the name when the title already starts with it
  const { siteName } = state;
  const prefix = [siteName && !title.startsWith(siteName) ? siteName : '', label].filter(Boolean).join(' ');
  return { url, alt: alt ?? (prefix ? `${prefix}: ${title}` : title), type: 'image/png', width: 1200, height: 630 };
}
