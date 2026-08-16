// Type definitions 17 - Shared types

export interface Type17 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type17Status = 'active' | 'inactive' | 'deleted';

export interface Type17Filter {
  status?: Type17Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
