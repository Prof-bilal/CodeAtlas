import { describe, it, expect } from 'vitest';
import { CircuitBreaker, CircuitBreakerState } from '../src/utils/circuitBreaker.js';
import { retry } from '../src/utils/retry.js';
import { PriorityQueue } from '../src/utils/queue.js';
import { LRUCache } from '../src/utils/lru.js';
import { Trie } from '../src/utils/trie.js';
import { topologicalSort } from '../src/utils/graph.js';
import { createTreeNode, addChild, getHeight, toArray } from '../src/utils/tree.js';

describe('CircuitBreaker', () => {
  it('should be closed initially', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker({
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 1000,
    });
    
    const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
    
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {}
    }
    
    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it('should reset after successful execution', async () => {
    const breaker = new CircuitBreaker();
    const successFn = vi.fn().mockResolvedValue('success');
    
    await breaker.execute(successFn);
    
    expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });
});

describe('retry', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('fail');
      }
      return 'success';
    });
    
    const result = await retry(fn, { maxRetries: 3, delayMs: 10 });
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(retry(fn, { maxRetries: 2, delayMs: 10 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('PriorityQueue', () => {
  it('should prioritize items by priority', () => {
    const queue = new PriorityQueue<string>();
    
    queue.enqueue('low', 1);
    queue.enqueue('high', 10);
    queue.enqueue('medium', 5);
    
    const high = queue.dequeue();
    expect(high?.data).toBe('high');
    
    const medium = queue.dequeue();
    expect(medium?.data).toBe('medium');
  });
});

describe('LRUCache', () => {
  it('should evict oldest items', () => {
    const cache = new LRUCache<string, number>({ maxSize: 2 });
    
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('Trie', () => {
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
});

describe('TreeNode', () => {
  it('should calculate height', () => {
    const root = createTreeNode('root');
    const child = createTreeNode('child');
    const grandchild = createTreeNode('grandchild');
    
    addChild(root, child);
    addChild(child, grandchild);
    
    expect(getHeight(root)).toBe(2);
  });
});
