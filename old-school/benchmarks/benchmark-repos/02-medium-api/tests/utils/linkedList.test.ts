import { describe, it, expect } from 'vitest';
import { LinkedList } from '../../src/utils/linkedList.js';

describe('LinkedList', () => {
  it('should append elements', () => {
    const list = new LinkedList<number>();
    list.append(1);
    list.append(2);
    list.append(3);
    expect(list.size).toBe(3);
    expect(list.toArray()).toEqual([1, 2, 3]);
  });

  it('should prepend elements', () => {
    const list = new LinkedList<number>();
    list.prepend(1);
    list.prepend(2);
    expect(list.toArray()).toEqual([2, 1]);
  });

  it('should remove elements', () => {
    const list = new LinkedList<number>();
    list.append(1);
    list.append(2);
    list.remove(1);
    expect(list.toArray()).toEqual([2]);
  });

  it('should find elements', () => {
    const list = new LinkedList<string>();
    list.append('hello');
    list.append('world');
    expect(list.find('hello')).toBe(true);
    expect(list.find('missing')).toBe(false);
  });
});
