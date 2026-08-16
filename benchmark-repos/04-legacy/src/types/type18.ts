// Type definitions 18 - DEPRECATED

export interface Type18 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type18Status = 'active' | 'inactive' | 'deleted';

export interface Type18Filter {
  status?: Type18Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
