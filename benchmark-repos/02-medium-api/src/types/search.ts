export interface SearchQuery {
  query: string;
  type?: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  documentId: string;
  documentType: string;
  content: string;
  metadata?: Record<string, any>;
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  duration: number;
}

export interface SearchIndexConfig {
  type: string;
  fields: string[];
  boost?: Record<string, number>;
  analyzer?: string;
}

export interface SearchStats {
  totalDocuments: number;
  documentsByType: Record<string, number>;
  lastIndexedAt?: Date;
  indexSize: number;
}

export const SEARCH_FIELDS = {
  task: ['title', 'description'],
  user: ['name', 'email'],
  file: ['filename', 'originalName', 'metadata'],
  notification: ['title', 'message'],
} as const;

export const SEARCH_BOOST = {
  title: 2.0,
  name: 1.5,
  description: 1.0,
  content: 1.0,
} as const;
