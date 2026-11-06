import { describe, it, expect, beforeEach } from 'vitest';
import { deriveName, colorSchemeVariants } from '../src/naming.mjs';

describe('deriveName', () => {
  it('converts URL path segments to a slug', () => {
    expect(deriveName('/admin/group/add')).toBe('admin-group-add');
  });

  it('strips leading slash', () => {
    expect(deriveName('/admin')).toBe('admin');
  });

  it('handles root path', () => {
    expect(deriveName('/')).toBe('screenshot');
  });

  it('handles full URLs', () => {
    expect(deriveName('http://localhost:9011/admin/group')).toBe('admin-group');
  });

  it('ignores query string and hash', () => {
    expect(deriveName('/admin/group?tab=members#section')).toBe('admin-group');
  });

  it('appends selector slug for single highlight', () => {
    const result = deriveName('/admin/group', [{ selector: '#group-name' }]);
    expect(result).toBe('admin-group-group-name');
  });

  it('appends multiple selector slugs', () => {
    const result = deriveName('/admin/group', [
      { selector: '.group-name' },
      { selector: '#submit-btn' },
    ]);
    expect(result).toBe('admin-group-group-name-submit-btn');
  });

  it('handles complex selectors', () => {
    const result = deriveName('/admin', [{ selector: 'input[type="text"]' }]);
    expect(result).toBe('admin-input-type-text');
  });

  it('resolves simple collisions with numeric suffix', () => {
    const used = new Set();
    const a = deriveName('/admin/group', [], used);
    const b = deriveName('/admin/group', [], used);
    const c = deriveName('/admin/group', [], used);
    expect(a).toBe('admin-group');
    expect(b).toBe('admin-group-1');
    expect(c).toBe('admin-group-2');
  });

  it('mutates the used set', () => {
    const used = new Set();
    deriveName('/admin', [], used);
    expect(used.has('admin')).toBe(true);
  });

  it('handles path segments with special chars', () => {
    expect(deriveName('/foo/bar_baz.html')).toBe('foo-bar-baz-html');
  });

  it('handles multi-part class selector', () => {
    const result = deriveName('/page', [{ selector: '.foo .bar' }]);
    expect(result).toBe('page-foo-bar');
  });

  it('empty highlights have no effect on the name', () => {
    expect(deriveName('/admin/group', [])).toBe('admin-group');
    expect(deriveName('/admin/group', [{ selector: undefined }])).toBe('admin-group');
  });
});

describe('colorSchemeVariants', () => {
  it('returns one variant for a single scheme', () => {
    expect(colorSchemeVariants('page', 'dark')).toEqual([{ colorScheme: 'dark', name: 'page' }]);
  });

  it('adds a .dark image for both', () => {
    expect(colorSchemeVariants('page', 'both')).toEqual([
      { colorScheme: 'light', name: 'page' },
      { colorScheme: 'dark', name: 'page.dark' },
    ]);
  });
});
