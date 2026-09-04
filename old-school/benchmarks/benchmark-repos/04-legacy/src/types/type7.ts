// Type definitions 7 - Shared types

export interface Type7 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type7Status = 'active' | 'inactive' | 'deleted';

export interface Type7Filter {
  status?: Type7Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
