import { describe, it, expect } from 'vitest';
import { ConfigSchema } from 'astro-better-declarative-screenshots';
import { resolveCaptures } from '../src/resolve.mjs';

const config = (overrides = {}) => ConfigSchema.parse({ baseUrl: 'http://localhost:4000', ...overrides });
const spec = (overrides = {}) => ({ name: 'page', url: '/page', highlights: [], ...overrides });

describe('resolveCaptures', () => {
  it('uses the window size and no full-page capture by default', () => {
    expect(resolveCaptures(spec(), config())).toEqual([
      { name: 'page', colorScheme: 'light', chromeTheme: 'light', width: 1280, height: 800, fullPage: false, maxHeight: 8000 },
    ]);
  });

  it('applies the config fullPage default and maxFullPage cap', () => {
    const [capture] = resolveCaptures(spec(), config({ fullPage: true, maxFullPage: { width: 2560, height: 2000 } }));
    expect(capture.fullPage).toBe(true);
    expect(capture.maxHeight).toBe(2000);
  });

  it('treats an explicit height as a fixed height under a fullPage default', () => {
    const [capture] = resolveCaptures(spec({ height: 742 }), config({ fullPage: true }));
    expect(capture.fullPage).toBe(false);
    expect(capture.height).toBe(742);
  });

  it('lets fullPage={false} opt out and maxHeight override the cap', () => {
    expect(resolveCaptures(spec({ fullPage: false }), config({ fullPage: true }))[0].fullPage).toBe(false);
    expect(resolveCaptures(spec({ fullPage: true, maxHeight: 1200 }), config())[0].maxHeight).toBe(1200);
  });

  it('clamps width and height to minWindow and maxWindow', () => {
    const [capture] = resolveCaptures(spec({ width: 100, height: 5000 }), config());
    expect(capture.width).toBe(640);
    expect(capture.height).toBe(1600);
  });

  it('captures light and dark images for colorScheme both', () => {
    const captures = resolveCaptures(spec(), config({ colorScheme: 'both' }));
    expect(captures.map(c => [c.name, c.colorScheme, c.chromeTheme])).toEqual([
      ['page', 'light', 'light'],
      ['page.dark', 'dark', 'dark'],
    ]);
  });

  it('lets a screenshot override the config color scheme', () => {
    expect(resolveCaptures(spec({ colorScheme: 'light' }), config({ colorScheme: 'both' }))).toHaveLength(1);
    expect(resolveCaptures(spec({ colorScheme: 'both' }), config())).toHaveLength(2);
  });

  it('keeps the configured chrome theme for a single-scheme screenshot', () => {
    const [capture] = resolveCaptures(spec(), config({ colorScheme: 'dark', chrome: { theme: 'light' } }));
    expect(capture).toMatchObject({ name: 'page', colorScheme: 'dark', chromeTheme: 'light' });
  });
});
