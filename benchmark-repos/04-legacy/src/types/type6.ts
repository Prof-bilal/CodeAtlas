// Type definitions 6 - DEPRECATED

export interface Type6 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type6Status = 'active' | 'inactive' | 'deleted';

export interface Type6Filter {
  status?: Type6Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
