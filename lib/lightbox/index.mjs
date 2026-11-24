/**
 * astro-better-lightbox
 *
 * Builds the markup for a JavaScript-free lightbox: the inline content, a
 * stretched button that opens a modal <dialog> through invoker commands
 * (commandfor/command), and the dialog with an enlarged copy and a close button.
 * The browser handles focus, Escape, and focus return.
 *
 * Lightbox.astro and LightboxImage.astro wrap this helper. Build-time plugins,
 * such as astro-better-mermaid, call lightboxHtml() directly.
 */

import { createHash } from 'node:crypto';

const ICON_ZOOM = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** Escape a string for a double-quoted HTML attribute. */
export function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Stable dialog id from the content, so builds stay reproducible. */
export function lightboxId(content) {
  return `abl-lightbox-${createHash('sha256').update(content).digest('hex').slice(0, 10)}`;
}

/**
 * Suffix every id in an HTML fragment, and the references to those ids
 * (`#id` in url(), href, and CSS, plus aria and `for` attributes), so a copy
 * of inline SVG can sit on the same page as the original.
 */
export function uniqueIds(html, suffix) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  if (!ids.size) return html;
  const swap = (id) => (ids.has(id) ? `${id}${suffix}` : id);
  return html
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${swap(id)}"`)
    .replace(/#([\w-]+)(?![\w-])/g, (match, id) => (ids.has(id) ? `#${swap(id)}` : match))
    .replace(/\b(aria-labelledby|aria-describedby|for)="([^"]*)"/g,
      (_, attr, refs) => `${attr}="${refs.split(/\s+/).map(swap).join(' ')}"`);
}

/**
 * Lightbox markup around `content`. Options:
 *   label  -- accessible name for the dialog, also used in the open button's name
 *   zoom   -- markup shown in the dialog (default: `content`)
 *   id     -- dialog id (default: a hash of `content`)
 *   class  -- extra class(es) on the wrapper
 */
export function lightboxHtml(content, { label = '', zoom = content, id = lightboxId(content), class: className } = {}) {
  const name = label.trim();
  const openName = name ? `Enlarge: ${name}` : 'Enlarge';
  const wrapperClass = ['abl-lightbox', className].filter(Boolean).join(' ');
  return `<div class="${escapeAttr(wrapperClass)}">` +
    content +
    `<button type="button" class="abl-lightbox-open" commandfor="${escapeAttr(id)}" command="show-modal" aria-haspopup="dialog" aria-label="${escapeAttr(openName)}">` +
    `<span class="abl-lightbox-icon">${ICON_ZOOM}</span></button>` +
    `<dialog id="${escapeAttr(id)}" class="abl-lightbox-dialog" aria-label="${escapeAttr(name || 'Enlarged view')}" data-markdown-ignore data-pagefind-ignore>` +
    `<div class="abl-lightbox-zoom">${zoom}</div>` +
    `<button type="button" class="abl-lightbox-close" commandfor="${escapeAttr(id)}" command="close" aria-label="Close" autofocus>` +
    `<span class="abl-lightbox-icon">${ICON_CLOSE}</span></button>` +
    `</dialog></div>`;
}
