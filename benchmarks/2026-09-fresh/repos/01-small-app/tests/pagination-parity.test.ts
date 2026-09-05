import { describe, it, expect } from 'vitest';
import {
  parsePagination,
  createPaginatedResponse,
  buildSortClause,
  PaginationParams,
} from '../src/utils/pagination.js';

// ──────────────────────────────────────────────────────────────────────────────
// Old behaviour (extracted from the pre-refactor code) preserved as reference
// implementations.  These are verbatim copies of what the route handler and
// service used to do before the centralisation.
// ──────────────────────────────────────────────────────────────────────────────

/** Old route-handler parsing (taskRoutes.ts lines 40-41, pre-refactor). */
function oldParseFromQuery(query: { page?: string; limit?: string }) {
  const page = parseInt(query.page as string) || 1;
  const limit = Math.min(parseInt(query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Old service response builder (taskService.ts lines 66-88, pre-refactor). */
function oldBuildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parity tests: old behaviour vs new utility
// ──────────────────────────────────────────────────────────────────────────────

describe('Pagination parity: parsePagination', () => {
  const cases: Array<{
    label: string;
    query: { page?: string; limit?: string };
  }> = [
    { label: 'defaults (empty query)', query: {} },
    { label: 'page=1, limit=20 (explicit defaults)', query: { page: '1', limit: '20' } },
    { label: 'page=3, limit=10', query: { page: '3', limit: '10' } },
    { label: 'page=0 (clamped to 1)', query: { page: '0' } },
    { label: 'page=-5 (clamped to 1)', query: { page: '-5' } },
    { label: 'page=NaN string (falls back to 1)', query: { page: 'abc' } },
    { label: 'limit=0 (clamped to 1 by new, but old allows 0 via || 20)', query: { limit: '0' } },
    { label: 'limit=200 (clamped to 100)', query: { limit: '200' } },
    { label: 'limit=-3 (clamped to 1 by new, negative in old)', query: { limit: '-3' } },
    { label: 'limit=NaN string (falls back to 20)', query: { limit: 'xyz' } },
    { label: 'page=1, limit=1', query: { page: '1', limit: '1' } },
    { label: 'page=100, limit=100', query: { page: '100', limit: '100' } },
    { label: 'large page=999999, limit=50', query: { page: '999999', limit: '50' } },
  ];

  it.each(cases)('produces valid params for: $label', ({ query }) => {
    const result = parsePagination(query);

    // The new utility always returns valid values:
    expect(result.page).toBeGreaterThanOrEqual(1);
    expect(result.limit).toBeGreaterThanOrEqual(1);
    expect(result.limit).toBeLessThanOrEqual(100);
    expect(result.offset).toBeGreaterThanOrEqual(0);
    expect(result.offset).toBe((result.page - 1) * result.limit);
  });

  it('matches old behaviour for well-formed inputs', () => {
    const query = { page: '3', limit: '15' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // For well-formed inputs the results are identical
    expect(newResult.page).toBe(oldResult.page);
    expect(newResult.limit).toBe(oldResult.limit);
    expect(newResult.offset).toBe(oldResult.offset);
  });

  it('diverges correctly from old for limit=0 (old gets 20, new gets 1)', () => {
    const query = { limit: '0' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // Old: parseInt('0') || 20 → 20 (because 0 is falsy)
    expect(oldResult.limit).toBe(20);
    // New: Math.min(100, Math.max(1, 0)) → 1
    expect(newResult.limit).toBe(1);
  });

  it('diverges correctly from old for limit=-3 (old gets -3, new gets 1)', () => {
    const query = { limit: '-3' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // Old: Math.min(parseInt('-3') || 20, 100) → Math.min(-3, 100) → -3
    expect(oldResult.limit).toBe(-3);
    // New: Math.min(100, Math.max(1, -3)) → 1
    expect(newResult.limit).toBe(1);
  });

  it('diverges correctly from old for page=-5 (old gets -5, new gets 1)', () => {
    const query = { page: '-5' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // Old: parseInt('-5') || 1 → -5 (because -5 is truthy)
    expect(oldResult.page).toBe(-5);
    // New: Math.max(1, -5) → 1
    expect(newResult.page).toBe(1);
  });

  it('matches old behaviour for NaN page string', () => {
    const query = { page: 'abc' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // Both handle NaN the same way (old: NaN || 1 → 1, new: Number.isNaN → 1)
    expect(newResult.page).toBe(oldResult.page);
    expect(newResult.page).toBe(1);
  });

  it('matches old behaviour for NaN limit string', () => {
    const query = { limit: 'xyz' };
    const oldResult = oldParseFromQuery(query);
    const newResult = parsePagination(query);

    // Both handle NaN the same way (old: NaN || 20 → 20, new: Number.isNaN → 20)
    expect(newResult.limit).toBe(oldResult.limit);
    expect(newResult.limit).toBe(20);
  });
});

describe('Pagination parity: createPaginatedResponse', () => {
  const data = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('matches old behaviour for typical page', () => {
    const params: PaginationParams = { page: 2, limit: 10, offset: 10 };
    const total = 25;

    const oldResult = oldBuildPaginatedResponse(data, total, params.page, params.limit);
    const newResult = createPaginatedResponse(data, total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.page).toBe(oldResult.page);
    expect(newResult.pagination.limit).toBe(oldResult.limit);
    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
  });

  it('matches old behaviour for first page', () => {
    const params: PaginationParams = { page: 1, limit: 20, offset: 0 };
    const total = 50;

    const oldResult = oldBuildPaginatedResponse(data, total, params.page, params.limit);
    const newResult = createPaginatedResponse(data, total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.page).toBe(oldResult.page);
    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
    expect(newResult.pagination.hasNext).toBe(true);
    expect(newResult.pagination.hasPrev).toBe(false);
  });

  it('matches old behaviour for last page', () => {
    const params: PaginationParams = { page: 3, limit: 10, offset: 20 };
    const total = 25;

    const oldResult = oldBuildPaginatedResponse(data, total, params.page, params.limit);
    const newResult = createPaginatedResponse(data, total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.page).toBe(oldResult.page);
    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
    expect(newResult.pagination.hasNext).toBe(false);
    expect(newResult.pagination.hasPrev).toBe(true);
  });

  it('matches old behaviour for empty results', () => {
    const params: PaginationParams = { page: 1, limit: 20, offset: 0 };
    const total = 0;

    const oldResult = oldBuildPaginatedResponse([], total, params.page, params.limit);
    const newResult = createPaginatedResponse([], total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.totalPages).toBe(0);
    expect(newResult.data).toHaveLength(0);
    expect(newResult.pagination.hasNext).toBe(false);
    expect(newResult.pagination.hasPrev).toBe(false);
  });

  it('matches old behaviour for empty page beyond total', () => {
    const params: PaginationParams = { page: 10, limit: 10, offset: 90 };
    const total = 5;

    const oldResult = oldBuildPaginatedResponse([], total, params.page, params.limit);
    const newResult = createPaginatedResponse([], total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
    expect(newResult.data).toHaveLength(0);
    expect(newResult.pagination.hasNext).toBe(false);
    expect(newResult.pagination.hasPrev).toBe(true);
  });

  it('matches old behaviour for exact page boundary', () => {
    const params: PaginationParams = { page: 2, limit: 10, offset: 10 };
    const total = 20;

    const oldResult = oldBuildPaginatedResponse(data, total, params.page, params.limit);
    const newResult = createPaginatedResponse(data, total, params);

    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
    expect(newResult.pagination.totalPages).toBe(2);
    expect(newResult.pagination.hasNext).toBe(false);
  });

  it('matches old behaviour for single item', () => {
    const params: PaginationParams = { page: 1, limit: 20, offset: 0 };
    const total = 1;

    const oldResult = oldBuildPaginatedResponse([data[0]], total, params.page, params.limit);
    const newResult = createPaginatedResponse([data[0]], total, params);

    expect(newResult.pagination.total).toBe(oldResult.total);
    expect(newResult.pagination.totalPages).toBe(1);
    expect(newResult.pagination.hasNext).toBe(false);
    expect(newResult.pagination.hasPrev).toBe(false);
  });

  it('matches old behaviour for limit=1', () => {
    const params: PaginationParams = { page: 5, limit: 1, offset: 4 };
    const total = 10;

    const oldResult = oldBuildPaginatedResponse([data[0]], total, params.page, params.limit);
    const newResult = createPaginatedResponse([data[0]], total, params);

    expect(newResult.pagination.totalPages).toBe(oldResult.totalPages);
    expect(newResult.pagination.totalPages).toBe(10);
    expect(newResult.pagination.hasNext).toBe(true);
    expect(newResult.pagination.hasPrev).toBe(true);
  });
});

describe('Pagination parity: buildSortClause', () => {
  it('returns allowed field with sort order', () => {
    expect(buildSortClause('title', 'ASC')).toBe('title ASC');
    expect(buildSortClause('created_at', 'DESC')).toBe('created_at DESC');
  });

  it('falls back to created_at for unknown field', () => {
    expect(buildSortClause('evil_field')).toBe('created_at DESC');
  });

  it('defaults to DESC order', () => {
    expect(buildSortClause('status')).toBe('status DESC');
  });
});

describe('Pagination parity: end-to-end round-trip', () => {
  it('parsePagination + createPaginatedResponse produce consistent results for page 1', () => {
    const query = { page: '1', limit: '5' };
    const params = parsePagination(query);
    const total = 12;

    const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const response = createPaginatedResponse(items, total, params);

    expect(response.pagination.page).toBe(1);
    expect(response.pagination.limit).toBe(5);
    expect(response.pagination.total).toBe(12);
    expect(response.pagination.totalPages).toBe(3);
    expect(response.pagination.hasNext).toBe(true);
    expect(response.pagination.hasPrev).toBe(false);
    expect(response.data).toHaveLength(5);
  });

  it('parsePagination + createPaginatedResponse produce consistent results for last page', () => {
    const query = { page: '3', limit: '5' };
    const params = parsePagination(query);
    const total = 12;

    const items = [{ id: 11 }, { id: 12 }];
    const response = createPaginatedResponse(items, total, params);

    expect(response.pagination.page).toBe(3);
    expect(response.pagination.totalPages).toBe(3);
    expect(response.pagination.hasNext).toBe(false);
    expect(response.pagination.hasPrev).toBe(true);
    expect(response.data).toHaveLength(2);
  });

  it('parsePagination + createPaginatedResponse produce consistent results for empty total', () => {
    const params = parsePagination({});
    const response = createPaginatedResponse([], 0, params);

    expect(response.pagination.total).toBe(0);
    expect(response.pagination.totalPages).toBe(0);
    expect(response.pagination.hasNext).toBe(false);
    expect(response.pagination.hasPrev).toBe(false);
    expect(response.data).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Flow parity: old route→service flow vs new consolidated flow
//
// The old flow was:
//   1. Route: parsePagination() → destructure { page, limit } → discard offset
//   2. Service: recompute offset = (page-1)*limit → createPaginatedResponse → flatten
//
// The new flow is:
//   1. Route: parsePagination() → pass full params to service
//   2. Service: use params directly → createPaginatedResponse (return as-is)
//
// These tests prove both flows produce identical observable outcomes.
// ──────────────────────────────────────────────────────────────────────────────

describe('Flow parity: old route→service vs new consolidated', () => {
  /** Simulates the old two-step flow: route parses, discards offset, service recomputes. */
  function oldFlow(query: { page?: string; limit?: string }, total: number, data: unknown[]) {
    const { page, limit } = oldParseFromQuery(query);
    const offset = (page - 1) * limit;
    const response = oldBuildPaginatedResponse(data, total, page, limit);
    return { params: { page, limit, offset }, response };
  }

  /** Simulates the new consolidated flow: parsePagination → pass params → createPaginatedResponse. */
  function newFlow(query: { page?: string; limit?: string }, total: number, data: unknown[]) {
    const params = parsePagination(query);
    const response = createPaginatedResponse(data, total, params);
    return { params, response };
  }

  const cases: Array<{ label: string; query: { page?: string; limit?: string }; total: number; itemCount: number }> = [
    { label: 'defaults, 25 items', query: {}, total: 25, itemCount: 20 },
    { label: 'page=2, limit=10, 50 items', query: { page: '2', limit: '10' }, total: 50, itemCount: 10 },
    { label: 'page=1, limit=1, 1 item', query: { page: '1', limit: '1' }, total: 1, itemCount: 1 },
    { label: 'page=5, limit=5, 25 items (exact boundary)', query: { page: '5', limit: '5' }, total: 25, itemCount: 5 },
    { label: 'page=10, limit=10, 5 items (empty page beyond total)', query: { page: '10', limit: '10' }, total: 5, itemCount: 0 },
    { label: 'page=1, limit=100, 0 items (empty total)', query: { page: '1', limit: '100' }, total: 0, itemCount: 0 },
    { label: 'page=1, limit=20, 20 items (exact page fill)', query: { page: '1', limit: '20' }, total: 20, itemCount: 20 },
    { label: 'page=3, limit=10, 25 items (last partial page)', query: { page: '3', limit: '10' }, total: 25, itemCount: 5 },
  ];

  it.each(cases)('identical totals/pages/hasNext/hasPrev for: $label', ({ query, total, itemCount }) => {
    const data = Array.from({ length: itemCount }, (_, i) => ({ id: i + 1 }));
    const old = oldFlow(query, total, data);
    const next = newFlow(query, total, data);

    // Pagination metadata must match exactly (old flat shape vs new nested shape)
    expect(next.response.pagination.total).toBe(old.response.total);
    expect(next.response.pagination.page).toBe(old.response.page);
    expect(next.response.pagination.limit).toBe(old.response.limit);
    expect(next.response.pagination.totalPages).toBe(old.response.totalPages);

    // New utility adds hasNext/hasPrev which old flow lacked — verify correctness
    expect(next.response.pagination.hasNext).toBe(next.response.pagination.page < next.response.pagination.totalPages);
    expect(next.response.pagination.hasPrev).toBe(next.response.pagination.page > 1);

    // Data passthrough unchanged
    expect(next.response.data).toHaveLength(data.length);
  });

  it('offset is computed identically in both flows', () => {
    const query = { page: '4', limit: '15' };
    const old = oldFlow(query, 100, []);
    const next = newFlow(query, 100, []);

    expect(next.params.offset).toBe(old.params.offset);
    expect(next.params.offset).toBe(45);
  });

  it('well-formed query produces identical page/limit in both flows', () => {
    const query = { page: '7', limit: '25' };
    const old = oldFlow(query, 200, []);
    const next = newFlow(query, 200, []);

    expect(next.params.page).toBe(old.params.page);
    expect(next.params.limit).toBe(old.params.limit);
    expect(next.params.page).toBe(7);
    expect(next.params.limit).toBe(25);
  });
});
