// turns a discovered spec plus the config into the captures to run, so take-screenshots
// and check-screenshots size and name every image the same way.

import { colorSchemeVariants } from 'astro-better-declarative-screenshots';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * @param {import('./discover.mjs').ScreenshotSpec} spec
 * @param {object} config - validated screenshot config
 * @returns {Array<{name: string, colorScheme: 'light'|'dark', chromeTheme: 'light'|'dark', width: number, height: number, fullPage: boolean, maxHeight: number}>}
 */
export function resolveCaptures(spec, config) {
  // an explicit height means that height, so the config-wide fullPage default skips it
  const fullPage = spec.fullPage ?? (spec.height === undefined && config.fullPage);
  const width = clamp(spec.width ?? config.window.width, config.minWindow.width, fullPage ? config.maxFullPage.width : config.maxWindow.width);
  const height = clamp(spec.height ?? config.window.height, config.minWindow.height, config.maxWindow.height);
  const maxHeight = Math.max(spec.maxHeight ?? config.maxFullPage.height, config.minWindow.height);

  const variants = colorSchemeVariants(spec.name, spec.colorScheme ?? config.colorScheme);
  // a png window frame matches each image when a screenshot captures both schemes
  return variants.map(variant => ({
    ...variant,
    chromeTheme: variants.length > 1 ? variant.colorScheme : config.chrome.theme,
    width, height, fullPage, maxHeight,
  }));
}
