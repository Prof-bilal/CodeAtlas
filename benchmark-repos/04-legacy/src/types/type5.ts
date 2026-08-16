// Type definitions 5 - Shared types

export interface Type5 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type5Status = 'active' | 'inactive' | 'deleted';

export interface Type5Filter {
  status?: Type5Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
