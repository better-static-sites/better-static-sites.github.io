import { describe, it, expect } from 'vitest';
import { parseShard, specsForShard } from '../src/shard.mjs';

const specs = [['a.mdx', 3], ['b.mdx', 1], ['c.mdx', 2], ['d.mdx', 2]]
  .flatMap(([file, n]) => Array.from({ length: n }, (_, i) => ({ sourceFile: file, name: `${file}-${i}` })));
const names = shard => specsForShard(specs, shard, () => 1).map(s => s.name);

describe('parseShard', () => {
  it('turns a one-based index into a zero-based one', () => {
    expect(parseShard('2/4')).toEqual({ index: 1, count: 4 });
  });

  it('rejects an index outside the count', () => {
    expect(() => parseShard('0/4')).toThrow();
    expect(() => parseShard('5/4')).toThrow();
    expect(() => parseShard('two')).toThrow();
  });
});

describe('specsForShard', () => {
  it('gives every spec to exactly one shard', () => {
    const all = [0, 1, 2].flatMap(index => names({ index, count: 3 }));
    expect(all.sort()).toEqual(specs.map(s => s.name).sort());
  });

  it('keeps the screenshots of one file together', () => {
    for (const index of [0, 1]) {
      const files = new Set(specsForShard(specs, { index, count: 2 }, () => 1).map(s => s.sourceFile));
      for (const file of files) expect(names({ index, count: 2 }).filter(n => n.startsWith(file))).toHaveLength(specs.filter(s => s.sourceFile === file).length);
    }
  });

  it('balances by weight and keeps discovery order', () => {
    expect(names({ index: 0, count: 2 })).toEqual(['a.mdx-0', 'a.mdx-1', 'a.mdx-2', 'b.mdx-0']);
    expect(names({ index: 1, count: 2 })).toEqual(['c.mdx-0', 'c.mdx-1', 'd.mdx-0', 'd.mdx-1']);
  });
});
