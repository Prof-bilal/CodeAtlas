export interface TagModel {
  id: string;
  name: string;
  color: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toTagResponse(tag: TagModel): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    userId: tag.userId,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

export function isValidColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}
