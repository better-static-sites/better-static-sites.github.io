import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `config-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(content) {
  writeFileSync(path.join(tmpDir, 'screenshot.config.mjs'), content);
}

describe('loadConfig', () => {
  it('throws when no config file exists', async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow(/No screenshot.config.mjs/);
  });

  it('loads a minimal valid config (no docker)', async () => {
    writeConfig(`
export default {
  baseUrl: 'http://localhost:9011',
};
`);
    const config = await loadConfig(tmpDir);
    expect(config.baseUrl).toBe('http://localhost:9011');
    expect(config.docker).toBeUndefined();
    // defaults applied
    expect(config.browser).toBe('webkit');
    expect(config.outputDir).toBe('./src/assets/screenshots');
    expect(config.colorScheme).toBe('light');
    expect(config.darkMode).toBe('media');
    expect(config.fullPage).toBe(false);
  });

  it('accepts colorScheme both and darkMode class', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', colorScheme: 'both', darkMode: 'class' };`);
    const config = await loadConfig(tmpDir);
    expect(config.colorScheme).toBe('both');
    expect(config.darkMode).toBe('class');
  });

  it('loads a config with docker settings', async () => {
    writeConfig(`
export default {
  baseUrl: 'http://localhost:9011',
  docker: {
    healthcheck: { url: 'http://localhost:9011/api/status' },
  },
};
`);
    const config = await loadConfig(tmpDir);
    expect(config.docker.healthcheck.url).toBe('http://localhost:9011/api/status');
  });

  it('defaults browserContainer to false', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011' };`);
    const config = await loadConfig(tmpDir);
    expect(config.browserContainer).toBe(false);
  });

  it('accepts browserContainer: true', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', browserContainer: true };`);
    expect((await loadConfig(tmpDir)).browserContainer).toBe(true);
  });

  it('accepts browserContainer with a custom image', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', browserContainer: { image: 'my/browser:1' } };`);
    expect((await loadConfig(tmpDir)).browserContainer).toEqual({ image: 'my/browser:1' });
  });

  it('rejects an empty browserContainer image', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', browserContainer: { image: '' } };`);
    await expect(loadConfig(tmpDir)).rejects.toThrow(/browserContainer/);
  });

  it('applies window defaults', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011' };`);
    const config = await loadConfig(tmpDir);
    expect(config.window.width).toBe(1280);
    expect(config.window.height).toBe(800);
  });

  it('applies chrome defaults', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011' };`);
    const config = await loadConfig(tmpDir);
    expect(config.chrome.style).toBe('macos');
    expect(config.chrome.showUrl).toBe(true);
    expect(config.chrome.showHost).toBe(true);
    expect(config.chrome.showQuery).toBe(true);
    expect(config.chrome.showHash).toBe(true);
    expect(config.chrome.shortenIds).toBe(false);
    expect(config.chrome.shadowBlur).toBe(40);
  });

  it('maps safari-macos and golden-gate to macos', async () => {
    for (const style of ['safari-macos', 'golden-gate']) {
      writeConfig(`export default { baseUrl: 'http://localhost:9011', chrome: { style: '${style}' } };`);
      expect((await loadConfig(tmpDir)).chrome.style).toBe('macos');
    }
  });

  it('rejects an unknown chrome style', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', chrome: { style: 'beos' } };`);
    await expect(loadConfig(tmpDir)).rejects.toThrow(/chrome\.style/);
  });

  it('keeps a fixed chrome url', async () => {
    writeConfig(`export default { baseUrl: 'http://localhost:9011', chrome: { url: 'local.example.com' } };`);
    const config = await loadConfig(tmpDir);
    expect(config.chrome.url).toBe('local.example.com');
  });

  it('accepts a custom outputDir', async () => {
    writeConfig(`
export default {
  baseUrl: 'http://localhost:9011',
  outputDir: 'public/screenshots',
};
`);
    const config = await loadConfig(tmpDir);
    expect(config.outputDir).toBe('public/screenshots');
  });

  it('rejects an invalid baseUrl', async () => {
    writeConfig(`export default { baseUrl: 'not-a-url' };`);
    await expect(loadConfig(tmpDir)).rejects.toThrow(/invalid/i);
  });

  it('accepts beforeScreenshot as a function', async () => {
    writeConfig(`
export default {
  baseUrl: 'http://localhost:9011',
  beforeScreenshot: async (page, spec) => {},
};
`);
    const config = await loadConfig(tmpDir);
    expect(typeof config.beforeScreenshot).toBe('function');
  });
});
