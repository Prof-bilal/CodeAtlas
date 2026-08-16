// Type definitions 2 - Shared types

export interface Type2 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type2Status = 'active' | 'inactive' | 'deleted';

export interface Type2Filter {
  status?: Type2Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
