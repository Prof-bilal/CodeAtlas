// Search service - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  query: string;
  took: number;
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  filters?: Record<string, any>;
  sort?: { field: string; direction: 'asc' | 'desc' };
}

export class SearchService {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async searchUsers(query: string, options: SearchOptions = {}): Promise<SearchResult<any>> {
    const start = Date.now();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    // Check cache
    const cacheKey = search:users:::;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const result = JSON.parse(cached);
      result.took = Date.now() - start;
      return result;
    }

    let whereClause = 'WHERE (username LIKE ? OR email LIKE ? OR display_name LIKE ?)';
    const params = [%%, %%, %%];

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        whereClause +=  AND  = ?;
        params.push(value);
      }
    }

    const countResult = await this.db.query(
      SELECT COUNT(*) as total FROM users ,
      params
    ) as any[];

    let orderClause = 'ORDER BY created_at DESC';
    if (options.sort) {
      orderClause = ORDER BY  ;
    }

    const results = await this.db.query(
      SELECT * FROM users   LIMIT ? OFFSET ?,
      [...params, limit, offset]
    ) as any[];

    const searchResult: SearchResult<any> = {
      items: results.map((r: any) => ({
        id: r.id,
        username: r.username,
        email: r.email,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
      })),
      total: countResult[0].total,
      page,
      limit,
      query,
      took: Date.now() - start,
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(searchResult));

    return searchResult;
  }

  async searchProducts(query: string, options: SearchOptions = {}): Promise<SearchResult<any>> {
    const start = Date.now();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const results = await this.db.query(
      SELECT * FROM products
       WHERE (name LIKE ? OR description LIKE ?)
       ORDER BY name ASC
       LIMIT ? OFFSET ?,
      [%%, %%, limit, offset]
    ) as any[];

    const countResult = await this.db.query(
      SELECT COUNT(*) as total FROM products
       WHERE (name LIKE ? OR description LIKE ?),
      [%%, %%]
    ) as any[];

    return {
      items: results,
      total: countResult[0].total,
      page,
      limit,
      query,
      took: Date.now() - start,
    };
  }

  async autocomplete(prefix: string, type: string = 'users'): Promise<string[]> {
    const cacheKey = utocomplete::;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    let results: any[] = [];

    if (type === 'users') {
      results = await this.db.query(
        SELECT username FROM users WHERE username LIKE ? LIMIT 10,
        [${prefix}%]
      ) as any[];
    } else if (type === 'products') {
      results = await this.db.query(
        SELECT name FROM products WHERE name LIKE ? LIMIT 10,
        [${prefix}%]
      ) as any[];
    }

    const suggestions = results.map((r: any) => r.username || r.name);
    await this.redis.setex(cacheKey, 60, JSON.stringify(suggestions));

    return suggestions;
  }
}
