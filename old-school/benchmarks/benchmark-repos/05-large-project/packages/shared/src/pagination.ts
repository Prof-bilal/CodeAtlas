export interface PaginationParams { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; }
export interface PaginatedResult<T> { data: T[]; pagination: PaginationMeta; }
export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean; }
export function paginate<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { page, limit } = params; const total = items.length; const totalPages = Math.ceil(total / limit);
  return { data: items.slice((page-1)*limit, page*limit), pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
}
export function offsetToCursor(offset: number): string { return Buffer.from('offset:'+offset).toString('base64'); }
export function cursorToOffset(cursor: string): number { const d = Buffer.from(cursor, 'base64').toString(); const m = d.match(/^offset:(\d+)$/); if (!m) throw new Error('Invalid cursor'); return parseInt(m[1], 10); }