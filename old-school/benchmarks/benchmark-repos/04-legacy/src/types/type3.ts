// Type definitions 3 - DEPRECATED

export interface Type3 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type3Status = 'active' | 'inactive' | 'deleted';

export interface Type3Filter {
  status?: Type3Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
