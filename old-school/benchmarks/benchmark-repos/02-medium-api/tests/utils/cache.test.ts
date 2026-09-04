import { describe, it, expect } from 'vitest';
import { CacheService } from '../../src/utils/cache.js';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it('should set and get values', async () => {
    await cache.set('key1', 'value1', 60);
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('should return null for missing keys', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    await cache.set('key1', 'value1', 60);
    await cache.delete('key1');
    const result = await cache.get('key1');
    expect(result).toBeNull();
  });

  it('should clear all values', async () => {
    await cache.set('key1', 'value1', 60);
    await cache.set('key2', 'value2', 60);
    await cache.clear();
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  it('should return cache size', async () => {
    await cache.set('a', 1, 60);
    await cache.set('b', 2, 60);
    expect(cache.size).toBe(2);
  });
});
