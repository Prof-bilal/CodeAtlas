// Type definitions 4 - Shared types

export interface Type4 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type4Status = 'active' | 'inactive' | 'deleted';

export interface Type4Filter {
  status?: Type4Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
