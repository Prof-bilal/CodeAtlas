import { UserRepository } from '../database/repositories/userRepository.js';
import { hashPassword, comparePassword } from '../../auth/password.js';
import { generateToken, verifyToken } from '../../auth/jwt.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface UserService {
  getUser(id: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  createUser(data: any): Promise<any>;
  updateUser(id: string, data: any): Promise<any>;
  deleteUser(id: string): Promise<boolean>;
  authenticate(email: string, password: string): Promise<{ user: any; token: string }>;
  refreshToken(token: string): Promise<{ token: string }>;
}

export class UserServiceImpl implements UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getUser(id: string): Promise<any> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getUserByEmail(email: string): Promise<any> {
    return this.userRepository.findByEmail(email);
  }

  async createUser(data: any): Promise<any> {
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const passwordHash = await hashPassword(data.password);
    const user = await this.userRepository.create({
      ...data,
      passwordHash,
    });

    await eventBus.publish('user.registered', {
      userId: user.id,
      email: user.email,
      name: user.name,
    }, 'user-service');

    return user;
  }

  async updateUser(id: string, data: any): Promise<any> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await this.userRepository.update(id, data);

    await eventBus.publish('user.updated', {
      userId: id,
      changes: data,
    }, 'user-service');

    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const deleted = await this.userRepository.delete(id);

    await eventBus.publish('user.deleted', {
      userId: id,
    }, 'user-service');

    return deleted;
  }

  async authenticate(email: string, password: string): Promise<{ user: any; token: string }> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

    await eventBus.publish('user.login_success', {
      userId: user.id,
      email: user.email,
    }, 'user-service');

    return { user, token };
  }

  async refreshToken(token: string): Promise<{ token: string }> {
    const payload = verifyToken(token);
    if (!payload) {
      throw new Error('Invalid token');
    }

    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newToken = generateToken({ userId: user.id, email: user.email, role: user.role });

    return { token: newToken };
  }
}

export const userService = new UserServiceImpl();
