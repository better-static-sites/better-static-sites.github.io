// Playwright-based page capture. opens the page, runs beforeScreenshot hooks,
// injects highlights, takes the screenshot, then cleans up.

import { chromium, firefox, webkit } from 'playwright';
import { injectHighlights, scrollIntoView } from 'astro-better-declarative-screenshots';

const BROWSERS = { webkit, chromium, firefox };

// a wsEndpoint comes from startBrowserContainer; exposeNetwork tunnels the container's localhost back to this host
function getBrowser(browserName, wsEndpoint) {
  return wsEndpoint
    ? BROWSERS[browserName].connect(wsEndpoint, { exposeNetwork: '<loopback>' })
    : BROWSERS[browserName].launch({ headless: true });
}

/**
 * @typedef {Object} CaptureOptions
 * @property {string} url - full URL including host
 * @property {string} name - screenshot name (for logging)
 * @property {Array<import('astro-better-declarative-screenshots').HighlightSpec>} highlights
 * @property {number} [width=1280]
 * @property {number} [height=800]
 * @property {boolean} [fullPage=false]
 * @property {string} [crop] - selector for the part of the page to crop to; covers every matching element (overrides fullPage)
 * @property {number} [cropPadding=16] - pixels of space kept around the cropped area
 * @property {'webkit'|'chromium'|'firefox'} [browser='webkit']
 * @property {'light'|'dark'} [colorScheme='light']
 * @property {Function} [beforeScreenshot]
 * @property {Function} [afterScreenshot]
 * @property {import('playwright').BrowserContext} [context] - reuse an existing context
 * @property {string} [wsEndpoint] - connect to a running browser server instead of launching one
 */

/**
 * Capture a single screenshot and return the PNG buffer.
 *
 * @param {CaptureOptions} opts
 * @returns {Promise<Buffer>}
 */
export async function capturePage(opts) {
  const {
    url,
    name,
    highlights = [],
    width = 1280,
    height = 800,
    fullPage = false,
    crop,
    cropPadding = 16,
    browser: browserName = 'webkit',
    colorScheme = 'light',
    beforeScreenshot,
    afterScreenshot,
    context: existingContext,
    wsEndpoint,
  } = opts;

  let browser;
  let context = existingContext;
  let page;
  let captureError;

  try {
    if (!context) {
      browser = await getBrowser(browserName, wsEndpoint);
      context = await browser.newContext({
        viewport: { width, height },
        colorScheme,
        deviceScaleFactor: 2,
      });
    }

    page = await context.newPage();
    await page.setViewportSize({ width, height });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (beforeScreenshot) {
      await beforeScreenshot(page, { url, name, highlights });
    }

    if (crop) {
      await prepareCrop(page, crop);
    } else if (fullPage) {
      // full-page captures render from y=0; scrolling first would displace sticky/fixed elements
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (highlights.length > 0 && highlights[0].selector) {
      await scrollIntoView(page, highlights[0].selector).catch(() => {});
    }

    const cleanup = await injectHighlights(page, highlights);

    // small pause to let any CSS transitions finish after highlight injection
    await page.waitForTimeout(150);

    const clip = crop ? await cropBox(page, crop, cropPadding) : undefined;

    const buffer = await page.screenshot({
      type: 'png',
      fullPage: crop ? false : fullPage,
      clip,
      animations: 'disabled',
    });

    await cleanup();

    return buffer;
  }
  catch (error) {
    captureError = error;
    throw error;
  }
  finally {
    try {
      if (page && afterScreenshot) await afterScreenshot(page, { url, name, highlights });
    }
    catch (cleanupError) {
      if (captureError) throw new AggregateError([captureError, cleanupError], `capture failed (${captureError.message}) and afterScreenshot cleanup failed (${cleanupError.message}) for ${name}`);
      throw cleanupError;
    }
    finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}

/**
 * Grow the viewport if the crop area is bigger than it, then scroll the area into view.
 * The crop area covers every element the selector matches, so a selector list such as
 * "main header, #name" keeps the page title in view along with the field.
 * Throws if the selector matches nothing, so a broken crop never produces a silent full-window image.
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function prepareCrop(page, selector) {
  const measure = (sel) => {
    const rects = [...document.querySelectorAll(sel)]
      .map(e => e.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    const width = Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left));
    return { top, bottom, width, height: bottom - top };
  };

  const size = await page.evaluate(measure, selector);
  if (!size) throw new Error(`crop selector matched no visible element: ${selector}`);

  const viewport = page.viewportSize();
  if (viewport && (size.width > viewport.width || size.height > viewport.height)) {
    await page.setViewportSize({
      width: Math.max(viewport.width, Math.ceil(size.width)),
      height: Math.max(viewport.height, Math.ceil(size.height)),
    });
  }

  // scroll so the middle of the crop area sits in the middle of the viewport
  const area = await page.evaluate(measure, selector);
  await page.evaluate(y => window.scrollBy(0, y), (area.top + area.bottom) / 2 - (page.viewportSize()?.height ?? 0) / 2);
}

/**
 * Viewport-relative clip rectangle around the crop area and every injected highlight
 * overlay (borders, arrows, labels), padded and clamped to the viewport.
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {number} padding
 * @returns {Promise<{x: number, y: number, width: number, height: number}>}
 */
async function cropBox(page, selector, padding) {
  const box = await page.evaluate(({ sel, pad }) => {
    const visible = els => [...els].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    const targets = visible(document.querySelectorAll(sel));
    if (!targets.length) return null;
    const rects = [...targets, ...visible(document.querySelectorAll('[id^="__screenshot_hl_"]'))];
    const x = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - pad));
    const y = Math.max(0, Math.floor(Math.min(...rects.map(r => r.top)) - pad));
    const right = Math.min(window.innerWidth, Math.ceil(Math.max(...rects.map(r => r.right)) + pad));
    const bottom = Math.min(window.innerHeight, Math.ceil(Math.max(...rects.map(r => r.bottom)) + pad));
    return { x, y, width: right - x, height: bottom - y };
  }, { sel: selector, pad: padding });
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`crop area not visible: ${selector}`);
  return box;
}

/**
 * Create a persistent browser context for taking multiple screenshots.
 * Caller is responsible for calling context.close() when done.
 *
 * @param {object} opts
 * @param {'webkit'|'chromium'|'firefox'} [opts.browser='webkit']
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=800]
 * @param {'light'|'dark'} [opts.colorScheme='light']
 * @param {string} [opts.wsEndpoint] - connect to a running browser server instead of launching one
 * @returns {Promise<{browser: import('playwright').Browser, context: import('playwright').BrowserContext}>}
 */
export async function createBrowserContext({ browser: browserName = 'webkit', width = 1280, height = 800, colorScheme = 'light', wsEndpoint } = {}) {
  const browser = await getBrowser(browserName, wsEndpoint);
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme,
    deviceScaleFactor: 2,
  });
  return { browser, context };
}
