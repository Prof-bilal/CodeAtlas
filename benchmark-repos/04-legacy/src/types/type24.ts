// Type definitions 24 - DEPRECATED

export interface Type24 {
  id: string;
  name: string;
  value: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type Type24Status = 'active' | 'inactive' | 'deleted';

export interface Type24Filter {
  status?: Type24Status;
  createdAfter?: Date;
  createdBefore?: Date;
}
