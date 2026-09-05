import { tagRepository } from '../repositories/tagRepository.js';
import { CreateTagInput, UpdateTagInput, TagResponse, toTagResponse } from '../models/tag.js';
import { AppError } from './authService.js';
import { createPaginatedResponse, PaginatedResponse, PaginationParams } from '../utils/pagination.js';

export class TagService {
  async create(input: CreateTagInput, userId: string): Promise<TagResponse> {
    const existing = await tagRepository.findByName(input.name, userId);
    if (existing) {
      throw new AppError('Tag with this name already exists', 409);
    }

    const tag = await tagRepository.create(input, userId);
    return toTagResponse(tag);
  }

  async findById(id: string, userId: string): Promise<TagResponse> {
    const tag = await tagRepository.findById(id);

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    if (tag.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    return toTagResponse(tag);
  }

  async findByUser(userId: string, params: PaginationParams): Promise<PaginatedResponse<TagResponse>> {
    const [tags, total] = await Promise.all([
      tagRepository.findByUser(userId, params.limit, params.offset),
      tagRepository.countByUser(userId),
    ]);

    const data = tags.map(toTagResponse);
    return createPaginatedResponse(data, total, params);
  }

  async update(id: string, input: UpdateTagInput, userId: string): Promise<TagResponse> {
    const existingTag = await tagRepository.findById(id);

    if (!existingTag) {
      throw new AppError('Tag not found', 404);
    }

    if (existingTag.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    if (input.name !== undefined) {
      const duplicate = await tagRepository.findByName(input.name, userId);
      if (duplicate && duplicate.id !== id) {
        throw new AppError('Tag with this name already exists', 409);
      }
    }

    const updatedTag = await tagRepository.update(id, input);
    return toTagResponse(updatedTag!);
  }

  async delete(id: string, userId: string): Promise<void> {
    const tag = await tagRepository.findById(id);

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    if (tag.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    await tagRepository.delete(id);
  }

  async addTagToTask(taskId: string, tagId: string, userId: string): Promise<void> {
    const tag = await tagRepository.findById(tagId);
    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    if (tag.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    await tagRepository.addTagToTask(taskId, tagId);
  }

  async removeTagFromTask(taskId: string, tagId: string, userId: string): Promise<void> {
    const tag = await tagRepository.findById(tagId);
    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    if (tag.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    await tagRepository.removeTagFromTask(taskId, tagId);
  }

  async setTagsForTask(taskId: string, tagIds: string[], userId: string): Promise<TagResponse[]> {
    for (const tagId of tagIds) {
      const tag = await tagRepository.findById(tagId);
      if (!tag) {
        throw new AppError(`Tag not found: ${tagId}`, 404);
      }
      if (tag.userId !== userId) {
        throw new AppError('Access denied', 403);
      }
    }

    await tagRepository.setTagsForTask(taskId, tagIds);
    const tags = await tagRepository.getTagsForTask(taskId);
    return tags.map(toTagResponse);
  }

  async getTagsForTask(taskId: string, userId: string): Promise<TagResponse[]> {
    const tags = await tagRepository.getTagsForTask(taskId);
    if (tags.length > 0 && tags[0].userId !== userId) {
      throw new AppError('Access denied', 403);
    }
    return tags.map(toTagResponse);
  }
}

export const tagService = new TagService();
