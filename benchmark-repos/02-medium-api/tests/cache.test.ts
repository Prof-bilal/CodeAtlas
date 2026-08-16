import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/utils/lru.js';

describe('LRU Cache', () => {
  it('should maintain max size', () => {
    const cache = new LRUCache<number, string>({ maxSize: 3 });
    cache.set(1, 'a');
    cache.set(2, 'b');
    cache.set(3, 'c');
    cache.set(4, 'd');
    expect(cache.size()).toBe(3);
    expect(cache.has(1)).toBe(false);
  });
});
