// Type definitions 25 - Shared types

export interface Type25 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type25Status = 'active' | 'inactive' | 'deleted';

export interface Type25Filter {
  status?: Type25Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
