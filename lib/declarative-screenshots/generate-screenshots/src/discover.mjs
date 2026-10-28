// scans MDX/Astro source files for Screenshot components and extracts their specs.
// this is how the CLI knows what screenshots to take without running the full Astro build.

import { readFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';
import { deriveName } from 'astro-better-declarative-screenshots';

/**
 * @typedef {Object} HighlightSpec
 * @property {string} selector
 * @property {'border'|'arrow'|'both'} style
 * @property {string} color
 * @property {string} label
 * @property {number} borderWidth
 */

/**
 * @typedef {Object} ScreenshotSpec
 * @property {string} url
 * @property {string} name - derived output filename without extension
 * @property {HighlightSpec[]} highlights
 * @property {number|undefined} width
 * @property {number|undefined} height
 * @property {boolean} fullPage
 * @property {string|undefined} crop - selector for the part of the page to crop to
 * @property {number|undefined} cropPadding - pixels of space kept around the cropped area
 * @property {boolean} clearBrowserBeforeCapture - whether to start this capture with a fresh browser context
 * @property {boolean} chrome - whether the window chrome is drawn; off by default when cropped
 * @property {string} sourceFile - absolute path of the file containing this Screenshot
 */

/**
 * Scan a project's source files and return all Screenshot specs.
 *
 * @param {string} projectRoot - absolute path to the project root
 * @param {string[]} [patterns] - glob patterns relative to projectRoot; default scans src/**
 * @returns {Promise<ScreenshotSpec[]>}
 */
export async function discoverScreenshots(projectRoot, patterns) {
  const defaultPatterns = ['src/**/*.mdx', 'src/**/*.md', 'src/**/*.astro'];
  const globs = (patterns ?? defaultPatterns).map(p => path.join(projectRoot, p));

  // fixed order, so state left by setup hooks is the same every run
  const files = (
    await Promise.all(globs.map(pattern => glob(pattern, { absolute: true })))
  ).flat().sort();

  const used = new Set();
  const specs = [];

  for (const file of files) {
    const fileSpecs = parseFile(file, used);
    specs.push(...fileSpecs);
  }

  return specs;
}

function parseFile(filePath, used) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const specs = [];

  // find all <Screenshot ...> blocks, including multiline
  // we look for <Screenshot, then collect attributes until we see > or />
  // then look for Highlight children until </Screenshot>
  // quoted and {...} attribute values are skipped whole, so a selector like "form > fieldset"
  // doesn't end the tag early
  const screenshotRe = /<Screenshot\b((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'{])*?)(?:\/>|>([\s\S]*?)<\/Screenshot>)/g;
  let match;

  while ((match = screenshotRe.exec(source)) !== null) {
    const attrBlock = match[1];
    const childBlock = match[2] ?? '';

    const url = extractProp(attrBlock, 'url');
    if (!url) continue;

    const id = extractProp(attrBlock, 'id');
    const widthStr = extractProp(attrBlock, 'width');
    const heightStr = extractProp(attrBlock, 'height');
    const fullPageStr = extractProp(attrBlock, 'fullPage');
    const crop = extractProp(attrBlock, 'crop');
    const cropPaddingStr = extractProp(attrBlock, 'cropPadding');
    const chromeStr = extractProp(attrBlock, 'chrome');
    const clearBrowserBeforeCapture = doesAttributeListIncludeName(attrBlock, 'clearBrowserBeforeCapture') ||
      extractProp(attrBlock, 'clearBrowserBeforeCapture') === 'true';

    const highlights = parseHighlightChildren(childBlock);
    const name = id ?? deriveName(url, highlights, used);

    specs.push({
      url,
      name,
      highlights,
      width:    widthStr  ? parseInt(widthStr, 10)  : undefined,
      height:   heightStr ? parseInt(heightStr, 10) : undefined,
      fullPage: fullPageStr === 'true' || fullPageStr === '{true}',
      crop,
      cropPadding: cropPaddingStr ? parseInt(cropPaddingStr, 10) : undefined,
      clearBrowserBeforeCapture,
      chrome: chromeStr === undefined ? !crop : chromeStr === 'true',
      sourceFile: filePath,
    });
  }

  return specs;
}

function doesAttributeListIncludeName(allAttributesString, attributeNameString) {
  const attributeNames = allAttributesString.replace(/"[^"]*"|'[^']*'|\{[^}]*\}/g, ' ');
  return new RegExp(`(?:^|\\s)${attributeNameString}(?=\\s|$)`).test(attributeNames);
}

function extractProp(attrBlock, propName) {
  // matches: propName="value" or propName={'value'} or propName={value}
  const re = new RegExp(
    `${propName}\\s*=\\s*(?:"([^"]*?)"|'([^']*?)'|\\{['"](.*?)['"]}|\\{([^}]+?)\\})`,
    's'
  );
  const m = re.exec(attrBlock);
  if (!m) return undefined;
  return (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function parseHighlightChildren(childBlock) {
  const highlights = [];
  const highlightRe = /<Highlight\b([^>]*?)(?:\/>|>[\s\S]*?<\/Highlight>)/g;
  let m;
  while ((m = highlightRe.exec(childBlock)) !== null) {
    const attrs = m[1];
    const selector = extractProp(attrs, 'selector');
    if (!selector) continue;
    highlights.push({
      selector,
      style:       extractProp(attrs, 'style')       ?? 'border',
      color:       extractProp(attrs, 'color')       ?? '#f60',
      label:       extractProp(attrs, 'label')       ?? '',
      borderWidth: parseInt(extractProp(attrs, 'borderWidth') ?? '3', 10),
    });
  }
  return highlights;
}
