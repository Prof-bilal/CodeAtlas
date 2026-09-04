// Model 4 - DEPRECATED

export interface Model4 {
  id: string;
  name: string;
  description?: string;
  properties: Record<string, any>;
  relations: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function createModel4(data: Partial<Model4>): Model4 {
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
