import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/utils/lru.js';
import { Trie } from '../src/utils/trie.js';
import { Pipeline } from '../src/utils/pipeline.js';
import { createPool } from '../src/utils/pool.js';
import { topologicalSort } from '../src/utils/graph.js';
import { createTreeNode, addChild, getHeight, toArray } from '../src/utils/tree.js';

describe('LRUCache', () => {
  it('should store and retrieve items', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    cache.set('b', 2);
    
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('should evict oldest items', () => {
    const cache = new LRUCache<string, number>(2);
    
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('Trie', () => {
  it('should insert and search words', () => {
    const trie = new Trie();
    
    trie.insert('hello');
    trie.insert('world');
    
    expect(trie.search('hello')).toBe(true);
    expect(trie.search('world')).toBe(true);
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
});

describe('Pipeline', () => {
  it('should execute middlewares in order', async () => {
    const pipeline = new Pipeline<{ values: string[] }>();
    const order: string[] = [];
    
    pipeline.use(async (ctx, next) => {
      order.push('first');
      await next();
    });
    
    pipeline.use(async (ctx, next) => {
      order.push('second');
      await next();
    });
    
    await pipeline.execute({ values: [] });
    
    expect(order).toEqual(['first', 'second']);
  });
});

describe('Pool', () => {
  it('should acquire and release items', async () => {
    let counter = 0;
    const pool = createPool(
      async () => ++counter,
      async () => {},
      { maxSize: 2 }
    );
    
    const item1 = await pool.acquire();
    const item2 = await pool.acquire();
    
    expect(item1).toBe(1);
    expect(item2).toBe(2);
    
    pool.release(item1);
    
    const stats = pool.getStats();
    expect(stats.available).toBe(1);
    expect(stats.inUse).toBe(1);
  });
});

describe('topologicalSort', () => {
  it('should sort nodes in topological order', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges: [string, string][] = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    
    const result = topologicalSort(nodes, edges);
    
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('c'));
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('d'));
    expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
  });

  it('should throw on cycle', () => {
    const nodes = ['a', 'b'];
    const edges: [string, string][] = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    
    expect(() => topologicalSort(nodes, edges)).toThrow('Cycle detected');
  });
});

describe('TreeNode', () => {
  it('should create tree structure', () => {
    const root = createTreeNode('root');
    const child1 = createTreeNode('child1');
    const child2 = createTreeNode('child2');
    
    addChild(root, child1);
    addChild(root, child2);
    
    expect(root.children).toHaveLength(2);
    expect(child1.parent).toBe(root);
  });

  it('should calculate height', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    const grandchild = createTreeNode('grandchild');
    
    addChild(root, child);
    addChild(child, grandchild);
    
    expect(getHeight(root)).toBe(2);
  });

  it('should convert to array', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    
    addChild(root, child);
    
    const arr = toArray(root);
    expect(arr).toEqual(['root', 'child']);
  });
});
