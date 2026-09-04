import { BaseRepository, BaseEntity, FindOptions, CountOptions } from '../BaseRepository.js';
import { User } from '@monorepo/shared';

export interface UserEntity extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  role: string;
  status: string;
  metadata: Record<string, unknown>;
}

export interface UserFilter {
  role?: string[];
  status?: string[];
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export class UserRepository extends BaseRepository<UserEntity> {
  private users: Map<string, UserEntity> = new Map();
  private emailIndex: Map<string, string> = new Map();

  constructor() {
    super('users');
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const id = this.emailIndex.get(email);
    return id ? this.users.get(id) || null : null;
  }

  async findMany(options: FindOptions = {}): Promise<UserEntity[]> {
    let users = Array.from(this.users.values());
    if (options.orderBy) {
      const dir = options.orderDirection === 'DESC' ? -1 : 1;
      users.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[options.orderBy!];
        const bVal = (b as Record<string, unknown>)[options.orderBy!];
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    if (options.offset) {
      users = users.slice(options.offset);
    }
    if (options.limit) {
      users = users.slice(0, options.limit);
    }
    return users;
  }

  async findWithFilter(filter: UserFilter): Promise<UserEntity[]> {
    let users = Array.from(this.users.values());
    if (filter.role && filter.role.length > 0) {
      users = users.filter(u => filter.role!.includes(u.role));
    }
    if (filter.status && filter.status.length > 0) {
      users = users.filter(u => filter.status!.includes(u.status));
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      users = users.filter(u =>
        u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
      );
    }
    if (filter.createdAfter) {
      users = users.filter(u => u.createdAt >= filter.createdAfter!);
    }
    if (filter.createdBefore) {
      users = users.filter(u => u.createdAt <= filter.createdBefore!);
    }
    return users;
  }

  async create(data: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserEntity> {
    const id = this.generateId();
    const now = new Date();
    const user: UserEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    this.emailIndex.set(user.email, id);
    return user;
  }

  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;
    this.users.delete(id);
    this.emailIndex.delete(user.email);
    return true;
  }

  async count(options: CountOptions = {}): Promise<number> {
    return this.users.size;
  }

  async getMany(ids: string[]): Promise<UserEntity[]> {
    return ids.map(id => this.users.get(id)).filter((u): u is UserEntity => u !== undefined);
  }

  async search(query: string): Promise<UserEntity[]> {
    const lower = query.toLowerCase();
    return Array.from(this.users.values()).filter(u =>
      u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)
    );
  }
}
