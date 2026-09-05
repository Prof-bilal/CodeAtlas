import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagService } from '../src/services/tagService.js';
import { tagRepository } from '../src/repositories/tagRepository.js';
import { AppError } from '../src/services/authService.js';

vi.mock('../src/repositories/tagRepository.js');

describe('TagService', () => {
  let tagService: TagService;

  beforeEach(() => {
    tagService = new TagService();
    vi.clearAllMocks();
    vi.mocked(tagRepository.countByUser).mockResolvedValue(0);
  });

  const mockUserId = 'user-123';
  const mockTagId = 'tag-456';

  const mockTag = {
    id: mockTagId,
    name: 'urgent',
    color: '#FF0000',
    userId: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('should create a tag successfully', async () => {
      vi.mocked(tagRepository.findByName).mockResolvedValue(null);
      vi.mocked(tagRepository.create).mockResolvedValue(mockTag);

      const result = await tagService.create({ name: 'urgent', color: '#FF0000' }, mockUserId);

      expect(result.name).toBe('urgent');
      expect(result.color).toBe('#FF0000');
      expect(tagRepository.create).toHaveBeenCalledWith({ name: 'urgent', color: '#FF0000' }, mockUserId);
    });

    it('should throw error when tag name already exists', async () => {
      vi.mocked(tagRepository.findByName).mockResolvedValue(mockTag);

      await expect(
        tagService.create({ name: 'urgent' }, mockUserId)
      ).rejects.toThrow(AppError);
      await expect(
        tagService.create({ name: 'urgent' }, mockUserId)
      ).rejects.toThrow('Tag with this name already exists');
    });
  });

  describe('findById', () => {
    it('should return a tag when found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);

      const result = await tagService.findById(mockTagId, mockUserId);

      expect(result.id).toBe(mockTagId);
      expect(result.name).toBe('urgent');
    });

    it('should throw error when tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(tagService.findById('nonexistent', mockUserId)).rejects.toThrow(AppError);
      await expect(tagService.findById('nonexistent', mockUserId)).rejects.toThrow('Tag not found');
    });

    it('should throw error when user does not own the tag', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue({
        ...mockTag,
        userId: 'other-user',
      });

      await expect(tagService.findById(mockTagId, mockUserId)).rejects.toThrow(AppError);
      await expect(tagService.findById(mockTagId, mockUserId)).rejects.toThrow('Access denied');
    });
  });

  describe('findByUser', () => {
    it('should return paginated tags for a user', async () => {
      vi.mocked(tagRepository.findByUser).mockResolvedValue([mockTag]);
      vi.mocked(tagRepository.countByUser).mockResolvedValue(1);

      const result = await tagService.findByUser(mockUserId, { page: 1, limit: 20, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('urgent');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should compute correct offset for page 2', async () => {
      vi.mocked(tagRepository.findByUser).mockResolvedValue([]);
      vi.mocked(tagRepository.countByUser).mockResolvedValue(0);

      await tagService.findByUser(mockUserId, { page: 2, limit: 10, offset: 10 });

      expect(tagRepository.findByUser).toHaveBeenCalledWith(mockUserId, 10, 10);
    });

    it('should handle empty results', async () => {
      vi.mocked(tagRepository.findByUser).mockResolvedValue([]);
      vi.mocked(tagRepository.countByUser).mockResolvedValue(0);

      const result = await tagService.findByUser(mockUserId, { page: 1, limit: 20, offset: 0 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
    });
  });

  describe('update', () => {
    it('should update a tag successfully', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.findByName).mockResolvedValue(null);
      vi.mocked(tagRepository.update).mockResolvedValue({
        ...mockTag,
        name: 'critical',
      });

      const result = await tagService.update(mockTagId, { name: 'critical' }, mockUserId);

      expect(result.name).toBe('critical');
    });

    it('should throw error when tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(
        tagService.update('nonexistent', { name: 'Updated' }, mockUserId)
      ).rejects.toThrow('Tag not found');
    });

    it('should throw error when user does not own the tag', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue({
        ...mockTag,
        userId: 'other-user',
      });

      await expect(
        tagService.update(mockTagId, { name: 'Updated' }, mockUserId)
      ).rejects.toThrow('Access denied');
    });

    it('should throw error when new name already exists', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.findByName).mockResolvedValue({
        ...mockTag,
        id: 'other-tag',
        name: 'existing',
      });

      await expect(
        tagService.update(mockTagId, { name: 'existing' }, mockUserId)
      ).rejects.toThrow('Tag with this name already exists');
    });
  });

  describe('delete', () => {
    it('should delete a tag successfully', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.delete).mockResolvedValue(true);

      await tagService.delete(mockTagId, mockUserId);

      expect(tagRepository.delete).toHaveBeenCalledWith(mockTagId);
    });

    it('should throw error when tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(tagService.delete('nonexistent', mockUserId)).rejects.toThrow('Tag not found');
    });

    it('should throw error when user does not own the tag', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue({
        ...mockTag,
        userId: 'other-user',
      });

      await expect(tagService.delete(mockTagId, mockUserId)).rejects.toThrow('Access denied');
    });
  });

  describe('addTagToTask', () => {
    it('should add a tag to a task', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.addTagToTask).mockResolvedValue();

      await tagService.addTagToTask('task-123', mockTagId, mockUserId);

      expect(tagRepository.addTagToTask).toHaveBeenCalledWith('task-123', mockTagId);
    });

    it('should throw error when tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(
        tagService.addTagToTask('task-123', 'nonexistent', mockUserId)
      ).rejects.toThrow('Tag not found');
    });

    it('should throw error when user does not own the tag', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue({
        ...mockTag,
        userId: 'other-user',
      });

      await expect(
        tagService.addTagToTask('task-123', mockTagId, mockUserId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('removeTagFromTask', () => {
    it('should remove a tag from a task', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.removeTagFromTask).mockResolvedValue(true);

      await tagService.removeTagFromTask('task-123', mockTagId, mockUserId);

      expect(tagRepository.removeTagFromTask).toHaveBeenCalledWith('task-123', mockTagId);
    });

    it('should throw error when tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(
        tagService.removeTagFromTask('task-123', 'nonexistent', mockUserId)
      ).rejects.toThrow('Tag not found');
    });
  });

  describe('setTagsForTask', () => {
    it('should set tags for a task', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagRepository.setTagsForTask).mockResolvedValue();
      vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([mockTag]);

      const result = await tagService.setTagsForTask('task-123', [mockTagId], mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('urgent');
      expect(tagRepository.setTagsForTask).toHaveBeenCalledWith('task-123', [mockTagId]);
    });

    it('should throw error when any tag not found', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue(null);

      await expect(
        tagService.setTagsForTask('task-123', ['nonexistent'], mockUserId)
      ).rejects.toThrow('Tag not found: nonexistent');
    });

    it('should throw error when user does not own any tag', async () => {
      vi.mocked(tagRepository.findById).mockResolvedValue({
        ...mockTag,
        userId: 'other-user',
      });

      await expect(
        tagService.setTagsForTask('task-123', [mockTagId], mockUserId)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getTagsForTask', () => {
    it('should return tags for a task', async () => {
      vi.mocked(tagRepository.getTagsForTask).mockResolvedValue([mockTag]);

      const result = await tagService.getTagsForTask('task-123', mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('urgent');
    });
  });
});
