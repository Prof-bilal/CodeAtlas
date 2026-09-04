import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import { User } from '../../types/responses.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface CreateUserDTO {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export class UserService {
  private users: User[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createUser(data: CreateUserDTO): Promise<User> {
    const existingUser = this.users.find(u => u.email === data.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user: User = {
      id: uuidv4(),
      email: data.email,
      name: data.name,
      password: hashedPassword,
      role: 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.push(user);
    await cacheService.invalidate('users');
    this.eventBus.emit('user:created', { user });

    return user;
  }

  async authenticate(email: string, password: string): Promise<AuthResult> {
    const user = this.users.find(u => u.email === email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '24h',
    });

    return { user, token };
  }

  async getUser(id: string): Promise<User> {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getAllUsers(options: { limit?: number; offset?: number; status?: string }): Promise<User[]> {
    let filtered = [...this.users];

    if (options.status) {
      filtered = filtered.filter(u => u.status === options.status);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 20;
    return filtered.slice(offset, offset + limit);
  }

  async updateUser(id: string, data: UpdateUserDTO): Promise<User> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new Error('User not found');
    }

    this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
    await cacheService.invalidate('users');
    this.eventBus.emit('user:updated', { user: this.users[index] });

    return this.users[index];
  }

  async deleteUser(id: string): Promise<void> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new Error('User not found');
    }

    const [deletedUser] = this.users.splice(index, 1);
    await cacheService.invalidate('users');
    this.eventBus.emit('user:deleted', { userId: id });
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    return this.updateUser(id, { role } as any);
  }

  async updateUserStatus(id: string, status: string): Promise<User> {
    return this.updateUser(id, { status } as any);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.getUser(id);
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.updateUser(id, { password: hashedPassword } as any);
    this.eventBus.emit('user:password:changed', { userId: id });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = this.users.find(u => u.email === email);
    if (!user) {
      return;
    }

    const resetToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    this.eventBus.emit('user:password:reset', { userId: user.id, resetToken });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
      const user = await this.getUser(decoded.userId);
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.updateUser(user.id, { password: hashedPassword } as any);
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }

  async refreshToken(token: string): Promise<{ token: string }> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
      const user = await this.getUser(decoded.userId);
      const newToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '24h',
      });
      return { token: newToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async verifyEmail(token: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
      await this.updateUser(decoded.userId, { emailVerified: true } as any);
    } catch (error) {
      throw new Error('Invalid verification token');
    }
  }
}

export const userService = new UserService(new EventBus());
