import { describe, it, expect } from 'vitest';
import { required, optional, compose, custom } from '../src/utils/validatorComb.js';
import { TTLCache } from '../src/utils/ttlCache.js';
import { StringValidator } from '../src/utils/schema.js';

describe('Validator Combinators', () => {
  it('should require values', () => {
    const validator = required(new StringValidator({ minLength: 3 }));
    
    expect(validator.validate(undefined as any)).toEqual({
      valid: false,
      errors: ['Value is required'],
    });
    
    expect(validator.validate('hello')).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('should make values optional', () => {
    const validator = optional(new StringValidator({ minLength: 3 }));
    
    expect(validator.validate(undefined)).toEqual({
      valid: true,
      errors: [],
    });
    
    expect(validator.validate('ab')).toEqual({
      valid: false,
      errors: ['Minimum length is 3'],
    });
  });

  it('should compose validators', () => {
    const validator = compose(
      new StringValidator({ required: true }),
      new StringValidator({ minLength: 3 }),
      new StringValidator({ maxLength: 10 })
    );
    
    expect(validator.validate('hi')).toEqual({
      valid: false,
      errors: ['Minimum length is 3'],
    });
    
    expect(validator.validate('hello')).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('should create custom validators', () => {
    const isEmail = custom<string>(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Invalid email format'
    );
    
    expect(isEmail.validate('test@example.com')).toEqual({
      valid: true,
      errors: [],
    });
    
    expect(isEmail.validate('invalid')).toEqual({
      valid: false,
      errors: ['Invalid email format'],
    });
  });
});

describe('TTLCache', () => {
  it('should store and retrieve values', () => {
    const cache = new TTLCache<string, number>(60000);
    
    cache.set('key', 42);
    expect(cache.get('key')).toBe(42);
  });

  it('should expire values', async () => {
    const cache = new TTLCache<string, number>(100);
    
    cache.set('key', 42);
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(cache.get('key')).toBeUndefined();
  });

  it('should track access counts', () => {
    const cache = new TTLCache<string, number>(60000);
    
    cache.set('key', 42);
    cache.get('key');
    cache.get('key');
    
    const stats = cache.getStats();
    expect(stats.totalAccessCount).toBe(2);
  });

  it('should cleanup expired entries', async () => {
    const cache = new TTLCache<string, number>(100);
    
    cache.set('key1', 1);
    cache.set('key2', 2);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });

  it('should destroy cleanup interval', () => {
    const cache = new TTLCache<string, number>(60000);
    cache.destroy();
    
    expect(cache.getStats().size).toBe(0);
  });
});
