// Type definitions 12 - DEPRECATED

export interface Type12 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type12Status = 'active' | 'inactive' | 'deleted';

export interface Type12Filter {
  status?: Type12Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
