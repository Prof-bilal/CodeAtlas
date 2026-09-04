// Type definitions 14 - Shared types

export interface Type14 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type14Status = 'active' | 'inactive' | 'deleted';

export interface Type14Filter {
  status?: Type14Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
