import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/utils/lru.js';
import { PriorityQueue } from '../src/utils/queue.js';
import { EventEmitter } from '../src/utils/events.js';

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

  it('should respect TTL', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10, ttl: 50 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    await new Promise(r => setTimeout(r, 60));
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('PriorityQueue', () => {
  it('should dequeue in priority order', () => {
    const q = new PriorityQueue<string>();
    q.enqueue('low', 1);
    q.enqueue('high', 10);
    q.enqueue('mid', 5);
    expect(q.dequeue()?.data).toBe('high');
    expect(q.dequeue()?.data).toBe('mid');
    expect(q.dequeue()?.data).toBe('low');
  });
});

describe('EventEmitter', () => {
  type Events = { test: { value: number }; error: Error };
  it('should emit and listen', () => {
    const emitter = new EventEmitter<Events>();
    let received = 0;
    emitter.on('test', (data) => { received = data.value; });
    emitter.emit('test', { value: 42 });
    expect(received).toBe(42);
  });

  it('should support once', () => {
    const emitter = new EventEmitter<Events>();
    let count = 0;
    emitter.once('test', () => { count++; });
    emitter.emit('test', { value: 1 });
    emitter.emit('test', { value: 2 });
    expect(count).toBe(1);
  });
});
