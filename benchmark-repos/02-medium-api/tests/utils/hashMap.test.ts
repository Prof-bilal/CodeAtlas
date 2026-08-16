import { describe, it, expect } from 'vitest';
import { HashMap } from '../../src/utils/hashMap.js';

describe('HashMap', () => {
  it('should set and get values', () => {
    const map = new HashMap<string, number>();
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
  });

  it('should check existence', () => {
    const map = new HashMap<string, number>();
    map.set('x', 10);
    expect(map.has('x')).toBe(true);
    expect(map.has('y')).toBe(false);
  });

  it('should delete keys', () => {
    const map = new HashMap<string, number>();
    map.set('a', 1);
    map.delete('a');
    expect(map.has('a')).toBe(false);
  });

  it('should return all keys', () => {
    const map = new HashMap<string, number>();
    map.set('a', 1);
    map.set('b', 2);
    const keys = map.keys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('should return size', () => {
    const map = new HashMap<string, number>();
    map.set('a', 1);
    map.set('b', 2);
    expect(map.size).toBe(2);
  });
});
