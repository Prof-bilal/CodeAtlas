import { query, queryOne } from '../config/database.js';
import { TagModel, CreateTagInput, UpdateTagInput } from '../models/tag.js';

export class TagRepository {
  async findById(id: string): Promise<TagModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM tags WHERE id = $1',
      [id]
    );

    if (!row) return null;

    return this.mapRowToTag(row);
  }

  async findByName(name: string, userId: string): Promise<TagModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM tags WHERE LOWER(name) = LOWER($1) AND user_id = $2',
      [name, userId]
    );

    if (!row) return null;

    return this.mapRowToTag(row);
  }

  async findByUser(userId: string, limit: number = 50, offset: number = 0): Promise<TagModel[]> {
    const rows = await query<any>(
      'SELECT * FROM tags WHERE user_id = $1 ORDER BY name ASC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );

    return rows.map(this.mapRowToTag);
  }

  async countByUser(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM tags WHERE user_id = $1',
      [userId]
    );

    return parseInt(result?.count || '0', 10);
  }

  async create(input: CreateTagInput, userId: string): Promise<TagModel> {
    const row = await queryOne<any>(
      `INSERT INTO tags (name, color, user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        input.name,
        input.color || null,
        userId,
      ]
    );

    return this.mapRowToTag(row!);
  }

  async update(id: string, input: UpdateTagInput): Promise<TagModel | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(input.color);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const row = await queryOne<any>(
      `UPDATE tags SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return row ? this.mapRowToTag(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM tags WHERE id = $1',
      [id]
    );

    return result.length > 0;
  }

  async addTagToTask(taskId: string, tagId: string): Promise<void> {
    await queryOne<any>(
      `INSERT INTO task_tags (task_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT (task_id, tag_id) DO NOTHING`,
      [taskId, tagId]
    );
  }

  async removeTagFromTask(taskId: string, tagId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2',
      [taskId, tagId]
    );

    return result.length > 0;
  }

  async getTagsForTask(taskId: string): Promise<TagModel[]> {
    const rows = await query<any>(
      `SELECT t.* FROM tags t
       INNER JOIN task_tags tt ON t.id = tt.tag_id
       WHERE tt.task_id = $1
       ORDER BY t.name ASC`,
      [taskId]
    );

    return rows.map(this.mapRowToTag);
  }

  async getTagsForTasks(taskIds: string[]): Promise<Map<string, TagModel[]>> {
    if (taskIds.length === 0) {
      return new Map();
    }

    const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query<any>(
      `SELECT tt.task_id, t.* FROM tags t
       INNER JOIN task_tags tt ON t.id = tt.tag_id
       WHERE tt.task_id IN (${placeholders})
       ORDER BY t.name ASC`,
      taskIds
    );

    const tagMap = new Map<string, TagModel[]>();
    for (const row of rows) {
      const tag = this.mapRowToTag(row);
      const taskId = row.task_id as string;
      const existing = tagMap.get(taskId) || [];
      existing.push(tag);
      tagMap.set(taskId, existing);
    }

    return tagMap;
  }

  async setTagsForTask(taskId: string, tagIds: string[]): Promise<void> {
    await query('DELETE FROM task_tags WHERE task_id = $1', [taskId]);

    for (const tagId of tagIds) {
      await queryOne<any>(
        `INSERT INTO task_tags (task_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT (task_id, tag_id) DO NOTHING`,
        [taskId, tagId]
      );
    }
  }

  private mapRowToTag(row: any): TagModel {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const tagRepository = new TagRepository();
