// Model 8 - DEPRECATED

export interface Model8 {
  id: string;
  name: string;
  description?: string;
  properties: Record<string, any>;
  relations: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function createModel8(data: Partial<Model8>): Model8 {
  return {
    id: data.id || '',
    name: data.name || '',
    description: data.description,
    properties: data.properties || {},
    relations: data.relations || [],
    createdAt: data.createdAt || new Date(),
    updatedAt: data.updatedAt || new Date(),
  };
}
