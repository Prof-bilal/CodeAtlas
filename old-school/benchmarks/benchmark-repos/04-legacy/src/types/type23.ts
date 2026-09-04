// Type definitions 23 - Shared types

export interface Type23 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type23Status = 'active' | 'inactive' | 'deleted';

export interface Type23Filter {
  status?: Type23Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
