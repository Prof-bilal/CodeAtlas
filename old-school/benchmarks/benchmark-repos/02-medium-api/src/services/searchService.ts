import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface SearchService {
  indexDocument(documentId: string, type: string, content: string, metadata?: any): Promise<void>;
  search(query: string, options?: any): Promise<any[]>;
  deleteDocument(documentId: string): Promise<void>;
  reindexAll(type?: string): Promise<number>;
}

export class SearchServiceImpl implements SearchService {
  async indexDocument(documentId: string, type: string, content: string, metadata?: any): Promise<void> {
    const tokens = this.tokenize(content);
    
    await databaseService.query(
      `INSERT INTO search_index (id, document_id, document_type, content, metadata, tokens)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, to_tsvector('english', $5))
       ON CONFLICT (document_id) DO UPDATE SET
         content = $3,
         metadata = $4,
         tokens = to_tsvector('english', $5),
         updated_at = CURRENT_TIMESTAMP`,
      [documentId, type, content, metadata ? JSON.stringify(metadata) : null, content]
    );
  }

  async search(query: string, options?: { type?: string; limit?: number; offset?: number }): Promise<any[]> {
    let sqlQuery = `
      SELECT 
        id,
        document_id,
        document_type,
        content,
        metadata,
        ts_rank(tokens, to_tsquery('english', $1)) as rank
      FROM search_index
      WHERE tokens @@ to_tsquery('english', $1)
    `;
    const params: any[] = [query];

    if (options?.type) {
      sqlQuery += ` AND document_type = $${params.length + 1}`;
      params.push(options.type);
    }

    sqlQuery += ' ORDER BY rank DESC';

    if (options?.limit) {
      sqlQuery += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sqlQuery += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query(sqlQuery, params);
    return result.rows;
  }

  async deleteDocument(documentId: string): Promise<void> {
    await databaseService.query(
      'DELETE FROM search_index WHERE document_id = $1',
      [documentId]
    );
  }

  async reindexAll(type?: string): Promise<number> {
    let deleteQuery = 'DELETE FROM search_index';
    const params: any[] = [];

    if (type) {
      deleteQuery += ' WHERE document_type = $1';
      params.push(type);
    }

    await databaseService.query(deleteQuery, params);
    
    return 0;
  }

  private tokenize(content: string): string[] {
    return content
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2);
  }
}

export const searchService = new SearchServiceImpl();
