export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function parsePagination(query: { page?: string; limit?: string }): PaginationParams {
  const rawPage = parseInt(query.page || '1', 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const rawLimit = parseInt(query.limit || '20', 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

export function buildSortClause(sortBy: string, sortOrder: 'ASC' | 'DESC' = 'DESC'): string {
  const allowedFields = ['created_at', 'updated_at', 'title', 'status', 'priority'];
  const field = allowedFields.includes(sortBy) ? sortBy : 'created_at';
  return `${field} ${sortOrder}`;
}
