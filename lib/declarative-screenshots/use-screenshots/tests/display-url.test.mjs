import { describe, it, expect } from 'vitest';
import { displayUrl } from '../src/display-url.mjs';

const BASE = 'http://localhost:9011';
const ID = '30663132-6464-6665-3032-326466613934';

describe('displayUrl', () => {
  it('shows a path as written by default', () => {
    expect(displayUrl('/admin/user?tenantId=1#roles', {}, BASE)).toBe('/admin/user?tenantId=1#roles');
  });

  it('puts chrome.baseUrl in front of a path', () => {
    expect(displayUrl('/docs/a', { baseUrl: 'https://example.com/' }, BASE)).toBe('https://example.com/docs/a');
  });

  it('swaps the config baseUrl in a full URL for chrome.baseUrl', () => {
    expect(displayUrl(`${BASE}/docs/a`, { baseUrl: 'https://example.com' }, BASE)).toBe('https://example.com/docs/a');
  });

  it('shows chrome.url in place of every URL', () => {
    expect(displayUrl('/docs/a', { url: 'example.com', showQuery: false }, BASE)).toBe('example.com');
  });

  it('drops the host when showHost is false', () => {
    const chrome = { showHost: false, baseUrl: 'https://example.com' };
    expect(displayUrl('http://127.0.0.1:9012/admin/setup?step=1', chrome, BASE)).toBe('/admin/setup?step=1');
    expect(displayUrl('/docs/a', chrome, BASE)).toBe('/docs/a');
    expect(displayUrl('https://example.com', chrome, BASE)).toBe('/');
  });

  it('drops the query string when showQuery is false', () => {
    expect(displayUrl('/admin/edit?id=1#jwt', { showQuery: false }, BASE)).toBe('/admin/edit#jwt');
    expect(displayUrl('/admin/edit?id=1', { showQuery: false }, BASE)).toBe('/admin/edit');
  });

  it('drops the hash when showHash is false', () => {
    expect(displayUrl('/admin/edit?id=1#jwt', { showHash: false }, BASE)).toBe('/admin/edit?id=1');
    expect(displayUrl('/admin/edit?id=1#jwt', { showQuery: false, showHash: false }, BASE)).toBe('/admin/edit');
  });

  it('shortens UUIDs when shortenIds is true', () => {
    expect(displayUrl(`/admin/tenant/edit/${ID}`, { shortenIds: true }, BASE)).toBe('/admin/tenant/edit/30663132...');
    expect(displayUrl(`/admin/tenant/edit/${ID.toUpperCase()}`, { shortenIds: true }, BASE)).toBe('/admin/tenant/edit/30663132...');
  });

  it('lets a screenshot override each setting', () => {
    const chrome = { showHost: false, showQuery: false, showHash: false, shortenIds: true, baseUrl: 'https://example.com' };
    const url = `/admin/edit/${ID}?step=1#jwt`;
    expect(displayUrl(url, chrome, BASE, { showHost: true })).toBe('https://example.com/admin/edit/30663132...');
    expect(displayUrl(url, chrome, BASE, { showQuery: true })).toBe('/admin/edit/30663132...?step=1');
    expect(displayUrl(url, chrome, BASE, { showHash: true })).toBe('/admin/edit/30663132...#jwt');
    expect(displayUrl(url, chrome, BASE, { shortenIds: false })).toBe(`/admin/edit/${ID}`);
  });

  it('truncates long URLs to maxLength', () => {
    const long = '/' + 'a'.repeat(100);
    expect(displayUrl(long, {}, BASE)).toHaveLength(72);
    expect(displayUrl(long, {}, BASE).endsWith('...')).toBe(true);
    expect(displayUrl(long, {}, BASE, { maxLength: 90 })).toHaveLength(90);
  });
});
