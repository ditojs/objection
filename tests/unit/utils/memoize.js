import { describe, it, expect } from 'vitest';
import { memoize } from '../../../lib/utils/memoize.js';

describe('memoize', () => {
  const createMemoized = () => {
    const calls = [];
    const func = memoize((str) => {
      calls.push(str);
      return str.toUpperCase();
    });
    return { func, calls };
  };

  it('caches the results', () => {
    const { func, calls } = createMemoized();
    expect(func('a')).toBe('A');
    expect(func('a')).toBe('A');
    expect(calls).toEqual(['a']);
  });

  it('drops the oldest result once the cache is full', () => {
    const { func, calls } = createMemoized();
    for (let i = 0; i <= 10000; i++) {
      func(`key${i}`);
    }
    func('key1');
    func('key0');
    expect(calls.slice(10001)).toEqual(['key0']);
  });

  it("doesn't cache long strings", () => {
    const { func, calls } = createMemoized();
    const str = 'a'.repeat(513);
    func(str);
    func(str);
    expect(calls).toEqual([str, str]);
  });
});
