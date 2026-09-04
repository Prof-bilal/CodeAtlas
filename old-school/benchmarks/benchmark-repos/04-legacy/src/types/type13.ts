// Type definitions 13 - Shared types

export interface Type13 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type13Status = 'active' | 'inactive' | 'deleted';

export interface Type13Filter {
  status?: Type13Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
