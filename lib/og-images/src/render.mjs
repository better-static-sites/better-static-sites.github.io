/**
 * Draws title cards as SVG and rasterizes them with sharp. Text becomes glyph
 * outlines from the configured font, so the output never depends on the fonts
 * installed on the build machine.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import sharp from 'sharp';

export const WIDTH = 1200;
export const HEIGHT = 630;

const PAD = 80;
const TEXT_WIDTH = WIDTH - PAD * 2;
const MAX_LINES = 3;

export const DEFAULT_FONT = new URL('./fonts/inter-latin-700-normal.woff', import.meta.url);

export const DEFAULT_COLORS = {
  background: '#0f172a',
  wordmark: '#ffffff',
  label: '#a5b4fc',
  title: '#ffffff',
  footer: '#94a3b8',
  bar: '#6366f1',
};

// fonts often lack these; a plain hyphen reads the same at card size
const SUBSTITUTES = { '‐': '-', '‑': '-' };

const loadFont = (file) => {
  const bytes = readFileSync(file);
  // a small file's Buffer can be a view into Node's shared pool, so slice out its own bytes
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

// the inner markup and viewBox of an <svg> element
const parseLogo = (svg) => {
  if (!svg) return null;
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error('[astro-better-og-images] `logo` must be SVG markup with an <svg> element');
  const viewBox = open[0].match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100';
  const inner = svg.slice(svg.indexOf(open[0]) + open[0].length, svg.lastIndexOf('</svg>')).replace(/<!--[\s\S]*?-->/g, '');
  return { viewBox, inner };
};

/**
 * Returns { renderCard, renderCopy } for one set of options. `font` is a path or
 * file URL to a TTF, OTF, or WOFF file (opentype.js can't read WOFF2).
 */
export function createRenderer({ font: fontFile = DEFAULT_FONT, colors: colorOverrides = {}, logo, wordmark = '', footer = '' } = {}) {
  const colors = { ...DEFAULT_COLORS, ...colorOverrides };
  const font = loadFont(fontFile);
  const logoSvg = parseLogo(logo);
  const scale = (size) => size / font.unitsPerEm;
  const segments = typeof wordmark === 'string'
    ? (wordmark ? [{ text: wordmark, color: colors.wordmark }] : [])
    : wordmark.map(s => ({ color: colors.wordmark, ...s }));

  // cmap and kerning lookups only; opentype.js text shaping is slow and can't apply every GSUB lookup
  const glyphs = new Map();
  const glyph = (char) => {
    let g = glyphs.get(char);
    if (!g) {
      g = font.charToGlyph(SUBSTITUTES[char] ?? char);
      glyphs.set(char, g);
    }
    return g;
  };

  const outlines = new Map();
  const outline = (g) => {
    let d = outlines.get(g.index);
    if (d === undefined) {
      d = g.getPath(0, 0, font.unitsPerEm).toPathData(0);
      outlines.set(g.index, d);
    }
    return d;
  };

  // glyph advances and kerning in font units
  const layoutLine = (text) => {
    const chars = [...text];
    const positions = [];
    let x = 0;
    chars.forEach((char, i) => {
      const g = glyph(char);
      positions.push({ g, x });
      x += g.advanceWidth + (i < chars.length - 1 ? font.getKerningValue(g, glyph(chars[i + 1])) : 0);
    });
    return { positions, width: x };
  };

  const textWidth = (text, size) => layoutLine(text).width * scale(size);

  // each glyph outline is defined once per image and placed with <use>
  const textPath = (text, x, y, size, fill, defs) => {
    const uses = layoutLine(text).positions
      // glyph 0 is .notdef, usually a box; a missing character draws nothing instead
      .filter(({ g }) => g.index !== 0 && outline(g))
      .map(({ g, x: gx }) => {
        defs.set(g.index, outline(g));
        return `<use href="#g${g.index}" x="${gx}"/>`;
      })
      .join('');
    return `<g fill="${fill}" transform="translate(${x} ${y}) scale(${scale(size)})">${uses}</g>`;
  };

  const wrap = (words, size) => {
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size) > TEXT_WIDTH) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // largest size that fits in MAX_LINES; truncates with an ellipsis at the smallest size
  const layoutTitle = (title) => {
    const words = title.split(/\s+/).filter(Boolean);
    for (const size of [72, 64, 56, 50]) {
      const lines = wrap(words, size);
      if (lines.length <= MAX_LINES && lines.every(l => textWidth(l, size) <= TEXT_WIDTH)) return { size, lines };
    }
    const size = 50;
    const lines = wrap(words, size).slice(0, MAX_LINES);
    let last = lines[MAX_LINES - 1];
    while (last.length && textWidth(`${last}...`, size) > TEXT_WIDTH) last = last.slice(0, -1).trimEnd();
    lines[MAX_LINES - 1] = `${last}...`;
    return { size, lines };
  };

  const cardSvg = ({ title, label }) => {
    const defs = new Map();
    const parts = [];

    let x = PAD;
    if (logoSvg) {
      parts.push(`<svg x="${PAD - 6}" y="62" width="64" height="64" viewBox="${logoSvg.viewBox}">${logoSvg.inner}</svg>`);
      x += 72;
    }
    for (const { text, color } of segments) {
      parts.push(textPath(text, x, 109, 40, color, defs));
      x += textWidth(text, 40);
    }
    if (label) parts.push(textPath(label, PAD, 196, 30, colors.label, defs));

    const { size, lines } = layoutTitle(title);
    const lineHeight = Math.round(size * 1.18);
    // first baseline sits one cap height below the label
    lines.forEach((line, i) => parts.push(textPath(line, PAD, 250 + Math.round(size * 0.73) + i * lineHeight, size, colors.title, defs)));

    if (footer) parts.push(textPath(footer, PAD, HEIGHT - 70, 28, colors.footer, defs));
    if (colors.bar) parts.push(`<rect y="${HEIGHT - 12}" width="${WIDTH}" height="12" fill="${colors.bar}"/>`);

    const glyphDefs = [...defs].map(([index, d]) => `<path id="g${index}" d="${d}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs>${glyphDefs}</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.background}"/>
${parts.join('\n')}
</svg>`;
  };

  return {
    cardSvg,
    /** A title card for a page without its own image, as a palette PNG. */
    renderCard: (job) => sharp(Buffer.from(cardSvg(job))).png({ palette: true, colors: 64, effort: 1 }).toBuffer(),
    /** A page's own image, cropped to 1200x630 and recompressed as JPEG. */
    renderCopy: (sourcePath) => sharp(sourcePath)
      .resize(WIDTH, HEIGHT, { fit: 'cover' })
      .flatten({ background: colors.background })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
  };
}
