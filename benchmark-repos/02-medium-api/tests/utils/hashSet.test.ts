import { describe, it, expect } from 'vitest';
import { HashSet } from '../../src/utils/hashSet.js';

describe('HashSet', () => {
  it('should add and check membership', () => {
    const set = new HashSet<string>();
    set.add('hello');
    set.add('world');
    expect(set.has('hello')).toBe(true);
    expect(set.has('world')).toBe(true);
    expect(set.has('missing')).toBe(false);
  });

  it('should remove elements', () => {
    const set = new HashSet<number>();
    set.add(1);
    set.add(2);
    set.remove(1);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(true);
  });

  it('should return size', () => {
    const set = new HashSet<string>();
    set.add('a');
    set.add('b');
    set.add('c');
    expect(set.size).toBe(3);
  });

  it('should check if empty', () => {
    const set = new HashSet<number>();
    expect(set.isEmpty).toBe(true);
    set.add(1);
    expect(set.isEmpty).toBe(false);
  });
});
