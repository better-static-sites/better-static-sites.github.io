import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverScreenshots } from '../src/discover.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `discover-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(tmpDir, 'src/content/docs'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(filename, content) {
  const fullPath = path.join(tmpDir, filename);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

describe('discoverScreenshots', () => {
  it('finds a simple Screenshot component', async () => {
    write('src/content/docs/groups.mdx', `
import Screenshot from 'astro-better-declarative-screenshots/Screenshot.astro';

<Screenshot url="/admin/group" />
`);

    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(1);
    expect(specs[0].url).toBe('/admin/group');
    expect(specs[0].name).toBe('admin-group');
  });

  it('finds Screenshot with Highlight children', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/group">
  <Highlight selector="#name" style="border" color="#f60" label="Name field" />
</Screenshot>
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(1);
    expect(specs[0].highlights).toHaveLength(1);
    expect(specs[0].highlights[0].selector).toBe('#name');
    expect(specs[0].highlights[0].color).toBe('#f60');
    expect(specs[0].name).toBe('admin-group-name');
  });

  it('finds multiple Screenshot components in one file', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/group" />
<Screenshot url="/admin/user" />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(2);
    expect(specs[0].url).toBe('/admin/group');
    expect(specs[1].url).toBe('/admin/user');
  });

  it('returns screenshots in file path order', async () => {
    write('src/content/docs/zebra.mdx', '<Screenshot url="/z" />');
    write('src/content/docs/apple.mdx', '<Screenshot url="/a" />');
    write('src/content/docs/mango/index.mdx', '<Screenshot url="/m" />');
    const specs = await discoverScreenshots(tmpDir);
    expect(specs.map(s => s.url)).toEqual(['/a', '/m', '/z']);
  });

  it('respects an explicit id prop', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/group" id="my-custom-name" />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs[0].name).toBe('my-custom-name');
  });

  it('extracts width/height/fullPage props', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin" width={1440} height={900} fullPage={true} />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs[0].width).toBe(1440);
    expect(specs[0].height).toBe(900);
    expect(specs[0].fullPage).toBe(true);
  });

  it('extracts crop/cropPadding props', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/tenant/add" crop="#tenant-form fieldset" cropPadding={8} />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs[0].crop).toBe('#tenant-form fieldset');
    expect(specs[0].cropPadding).toBe(8);
  });

  it('turns the chrome off for cropped screenshots unless asked for', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/one" />
<Screenshot url="/two" crop="main" />
<Screenshot url="/three" crop="main" chrome={true} />
<Screenshot url="/four" chrome={false} />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs.map(s => s.chrome)).toEqual([true, false, true, false]);
  });

  it('keeps parsing after a crop selector containing >', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/one" crop="form > fieldset" />
<Screenshot url="/two">
  <Highlight selector="#name" />
</Screenshot>
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(2);
    expect(specs[0].crop).toBe('form > fieldset');
    expect(specs[0].highlights).toHaveLength(0);
    expect(specs[1].url).toBe('/two');
    expect(specs[1].highlights[0].selector).toBe('#name');
  });

  it('handles same URL with different highlights -- no collision', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/group">
  <Highlight selector="#name" />
</Screenshot>
<Screenshot url="/admin/group">
  <Highlight selector="#id" />
</Screenshot>
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(2);
    expect(specs[0].name).toBe('admin-group-name');
    expect(specs[1].name).toBe('admin-group-id');
  });

  it('resolves same URL + same highlights collision with numeric suffix', async () => {
    write('src/content/docs/page.mdx', `
<Screenshot url="/admin/group" />
<Screenshot url="/admin/group" />
`);
    const specs = await discoverScreenshots(tmpDir);
    expect(specs[0].name).toBe('admin-group');
    expect(specs[1].name).toBe('admin-group-1');
  });

  it('returns empty array when no Screenshot components found', async () => {
    write('src/content/docs/page.mdx', 'Just some markdown content.\n');
    const specs = await discoverScreenshots(tmpDir);
    expect(specs).toHaveLength(0);
  });

  it('records the source file path', async () => {
    const filePath = 'src/content/docs/groups.mdx';
    write(filePath, '<Screenshot url="/admin" />');
    const specs = await discoverScreenshots(tmpDir);
    expect(specs[0].sourceFile).toBe(path.join(tmpDir, filePath));
  });
});
