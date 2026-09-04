export interface Type16 {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateType {
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateType {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface Type {
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export function isType(type: Type16): boolean {
  return type.name.length > 0;
}

export function formatType16(type: Type16): Record<string, unknown> {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  };
}

export function validateType(request: CreateType): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!request.name) errors.push('Name is required');
  if (request.name.length > 200) errors.push('Name too long');
  if (!request.description) errors.push('Description is required');
  return { valid: errors.length === 0, errors };
}
