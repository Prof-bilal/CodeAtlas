// Type definitions 1 - Shared types

export interface Type1 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type1Status = 'active' | 'inactive' | 'deleted';

export interface Type1Filter {
  status?: Type1Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
