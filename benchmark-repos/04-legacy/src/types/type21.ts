// Type definitions 21 - DEPRECATED

export interface Type21 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type21Status = 'active' | 'inactive' | 'deleted';

export interface Type21Filter {
  status?: Type21Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
