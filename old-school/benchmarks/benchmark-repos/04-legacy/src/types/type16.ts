// Type definitions 16 - Shared types

export interface Type16 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type16Status = 'active' | 'inactive' | 'deleted';

export interface Type16Filter {
  status?: Type16Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
