// Type definitions 8 - Shared types

export interface Type8 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type8Status = 'active' | 'inactive' | 'deleted';

export interface Type8Filter {
  status?: Type8Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
