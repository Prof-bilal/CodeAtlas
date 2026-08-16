import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/utils/lru.js';
import { PriorityQueue } from '../src/utils/queue.js';
import { Trie } from '../src/utils/trie.js';
import { createTreeNode, addChild, getHeight, toArray, findNode, traversePreOrder, traversePostOrder, getDepth, removeChild } from '../src/utils/tree.js';
import { topologicalSort } from '../src/utils/graph.js';

describe('LRUCache', () => {
  it('should create cache with max size', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    expect(cache).toBeDefined();
  });

  it('should set and get values', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('should evict oldest items', () => {
    const cache = new LRUCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('should check if key exists', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('should delete key', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should clear cache', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('should return keys', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys()).toContain('a');
    expect(cache.keys()).toContain('b');
  });

  it('should return values', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.values()).toContain(1);
    expect(cache.values()).toContain(2);
  });

  it('should return stats', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(3);
  });
});

describe('PriorityQueue', () => {
  it('should create queue', () => {
    const queue = new PriorityQueue<string>();
    expect(queue).toBeDefined();
  });

  it('should enqueue and dequeue', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 1);
    const item = queue.dequeue();
    expect(item?.data).toBe('a');
  });

  it('should prioritize items', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('low', 1);
    queue.enqueue('high', 10);
    queue.enqueue('medium', 5);
    expect(queue.dequeue()?.data).toBe('high');
    expect(queue.dequeue()?.data).toBe('medium');
    expect(queue.dequeue()?.data).toBe('low');
  });

  it('should peek at front item', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    expect(queue.peek()?.data).toBe('b');
  });

  it('should return size', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    expect(queue.size()).toBe(2);
  });

  it('should check if empty', () => {
    const queue = new PriorityQueue<string>();
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue('a', 1);
    expect(queue.isEmpty()).toBe(false);
  });

  it('should remove item by id', () => {
    const queue = new PriorityQueue<string>();
    const id = queue.enqueue('a', 1);
    expect(queue.remove(id)).toBe(true);
    expect(queue.size()).toBe(0);
  });

  it('should find item by id', () => {
    const queue = new PriorityQueue<string>();
    const id = queue.enqueue('a', 1);
    const item = queue.find(id);
    expect(item?.data).toBe('a');
  });

  it('should return array', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    const arr = queue.toArray();
    expect(arr.length).toBe(2);
  });

  it('should clear queue', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 1);
    queue.enqueue('b', 2);
    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it('should return stats', () => {
    const queue = new PriorityQueue<string>();
    queue.enqueue('a', 5);
    queue.enqueue('b', 10);
    const stats = queue.getStats();
    expect(stats.size).toBe(2);
    expect(stats.averagePriority).toBe(7.5);
  });
});

describe('Trie', () => {
  it('should create trie', () => {
    const trie = new Trie();
    expect(trie).toBeDefined();
  });

  it('should insert and search', () => {
    const trie = new Trie();
    trie.insert('hello');
    expect(trie.search('hello')).toBe(true);
    expect(trie.search('hell')).toBe(false);
  });

  it('should find words by prefix', () => {
    const trie = new Trie();
    trie.insert('hello');
    trie.insert('help');
    trie.insert('world');
    const results = trie.startsWith('hel');
    expect(results).toContain('hello');
    expect(results).toContain('help');
    expect(results).not.toContain('world');
  });

  it('should return empty array for no matches', () => {
    const trie = new Trie();
    trie.insert('hello');
    const results = trie.startsWith('xyz');
    expect(results).toHaveLength(0);
  });
});

describe('TreeNode', () => {
  it('should create tree node', () => {
    const node = createTreeNode('root');
    expect(node.value).toBe('root');
    expect(node.children).toHaveLength(0);
  });

  it('should add child', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].value).toBe('child');
  });

  it('should remove child', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    removeChild(root, child);
    expect(root.children).toHaveLength(0);
  });

  it('should calculate height', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    const grandchild = createTreeNode('grandchild');
    addChild(root, child);
    addChild(child, grandchild);
    expect(getHeight(root)).toBe(2);
  });

  it('should calculate depth', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    const grandchild = createTreeNode('grandchild');
    addChild(root, child);
    addChild(child, grandchild);
    expect(getDepth(grandchild)).toBe(2);
  });

  it('should find node', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    const found = findNode(root, (value) => value === 'child');
    expect(found).toBeDefined();
    expect(found?.value).toBe('child');
  });

  it('should traverse pre-order', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    const values: string[] = [];
    traversePreOrder(root, (value) => values.push(value));
    expect(values).toEqual(['root', 'child']);
  });

  it('should traverse post-order', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    const values: string[] = [];
    traversePostOrder(root, (value) => values.push(value));
    expect(values).toEqual(['child', 'root']);
  });

  it('should convert to array', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    addChild(root, child);
    const arr = toArray(root);
    expect(arr).toEqual(['root', 'child']);
  });
});

describe('topologicalSort', () => {
  it('should sort nodes in dependency order', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges: [string, string][] = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
  });

  it('should throw error on cycle', () => {
    const nodes = ['a', 'b'];
    const edges: [string, string][] = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    expect(() => topologicalSort(nodes, edges)).toThrow('Cycle detected');
  });
});
