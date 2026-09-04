import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../src/utils/cache.js';
import { sanitizeHtml, sanitizeInput, escapeRegex, truncate, slugify, capitalize, camelToSnake, snakeToCamel, deepClone, isEmpty, pick, omit } from '../src/utils/helpers.js';
import { parsePagination, createPaginatedResponse, buildSortClause } from '../src/utils/pagination.js';

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

  it('should increment and decrement', async () => {
    await cache.set('counter', 0);
    
    const incremented = await cache.increment('counter');
    expect(incremented).toBe(1);
    
    const decremented = await cache.decrement('counter');
    expect(decremented).toBe(0);
  });
});

describe('Helpers', () => {
  describe('sanitizeHtml', () => {
    it('should escape HTML characters', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });
  });

  describe('sanitizeInput', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeInput("O'Brien")).toBe("O&#x27;Brien");
    });
  });

  describe('escapeRegex', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('hi', 8)).toBe('hi');
    });
  });

  describe('slugify', () => {
    it('should create URL-friendly slugs', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
    });
  });

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
    });
  });

  describe('deepClone', () => {
    it('should deep clone objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });
  });

  describe('isEmpty', () => {
    it('should check if value is empty', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });
});

describe('Pagination', () => {
  describe('parsePagination', () => {
    it('should parse pagination params', () => {
      const result = parsePagination({ page: '2', limit: '10' });
      
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(10);
    });

    it('should use default values', () => {
      const result = parsePagination({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should enforce limits', () => {
      const result = parsePagination({ page: '1', limit: '200' });
      
      expect(result.limit).toBe(100);
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const params = { page: 1, limit: 10, offset: 0 };
      
      const result = createPaginatedResponse(data, 25, params);
      
      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });
  });

  describe('buildSortClause', () => {
    it('should build sort clause', () => {
      expect(buildSortClause('created_at', 'ASC')).toBe('created_at ASC');
      expect(buildSortClause('invalid', 'DESC')).toBe('created_at DESC');
    });
  });
});
