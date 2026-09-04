import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../src/utils/cache.js';
import { PriorityQueue } from '../src/utils/queue.js';
import { RateLimiter } from '../src/utils/rateLimiter.js';
import { CircuitBreaker, CircuitBreakerState } from '../src/utils/circuitBreaker.js';
import { retry } from '../src/utils/retry.js';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService('test');
  });

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1', 60);
    const result = await cache.get<string>('key1');
    expect(result).toBe('value1');
  });

  it('should return null for non-existent keys', async () => {
    const result = await cache.get<string>('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    await cache.set('key1', 'value1');
    await cache.delete('key1');
    const result = await cache.get<string>('key1');
    expect(result).toBeNull();
  });

  it('should get or set values', async () => {
    const factory = vi.fn().mockResolvedValue('computed');
    const result1 = await cache.getOrSet('key1', factory);
    const result2 = await cache.getOrSet('key1', factory);
    
    expect(result1).toBe('computed');
    expect(result2).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('PriorityQueue', () => {
  let queue: PriorityQueue<string>;

  beforeEach(() => {
    queue = new PriorityQueue<string>();
  });

  it('should enqueue and dequeue items', () => {
    queue.enqueue('item1');
    queue.enqueue('item2');
    
    const item1 = queue.dequeue();
    expect(item1?.data).toBe('item1');
  });

  it('should prioritize items by priority', () => {
    queue.enqueue('low', 1);
    queue.enqueue('high', 10);
    queue.enqueue('medium', 5);
    
    const high = queue.dequeue();
    expect(high?.data).toBe('high');
    
    const medium = queue.dequeue();
    expect(medium?.data).toBe('medium');
  });

  it('should return correct size', () => {
    queue.enqueue('item1');
    queue.enqueue('item2');
    
    expect(queue.size()).toBe(2);
  });

  it('should peek without removing', () => {
    queue.enqueue('item1');
    const peeked = queue.peek();
    
    expect(peeked?.data).toBe('item1');
    expect(queue.size()).toBe(1);
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(1000, 3);
  });

  it('should allow requests within limit', () => {
    const result1 = limiter.isAllowed('user1');
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);
    
    const result2 = limiter.isAllowed('user1');
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);
  });

  it('should block requests exceeding limit', () => {
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    
    const result = limiter.isAllowed('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset keys', () => {
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    
    limiter.reset('user1');
    
    const result = limiter.isAllowed('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 1000,
    });
  });

  it('should be closed initially', () => {
    expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should open after threshold failures', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
    
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {}
    }
    
    expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it('should reset after successful execution', async () => {
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
