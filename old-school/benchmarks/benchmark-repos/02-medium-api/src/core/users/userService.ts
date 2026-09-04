import bcrypt from 'bcryptjs';
import { authConfig } from '../../config/auth.js';
import { userRepository } from '../../repositories/userRepository.js';
import { CreateUserInput, UpdateUserInput, UserModel, UserResponse, toUserResponse } from '../../models/user.js';
import { AppError } from '../auth/authService.js';

export class UserService {
  async create(input: CreateUserInput): Promise<UserResponse> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    const user = await userRepository.create(input);
    return toUserResponse(user);
  }

  async findById(id: string): Promise<UserResponse> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return toUserResponse(user);
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    return userRepository.findByEmail(email);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserResponse> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (input.email && input.email !== user.email) {
      const emailExists = await userRepository.emailExists(input.email, id);
      if (emailExists) {
        throw new AppError('Email already in use', 409);
      }
    }

    const updatedUser = await userRepository.update(id, input);
    return toUserResponse(updatedUser!);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    await userRepository.updatePassword(id, newPassword);
  }

  async delete(id: string): Promise<void> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    await userRepository.delete(id);
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<UserResponse[]> {
    const users = await userRepository.findAll(limit, offset);
    return users.map(toUserResponse);
  }

  async count(): Promise<number> {
    return userRepository.count();
  }

  async deactivate(id: string): Promise<UserResponse> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await userRepository.update(id, { isActive: false } as any);
    return toUserResponse(updatedUser!);
  }

  async activate(id: string): Promise<UserResponse> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await userRepository.update(id, { isActive: true } as any);
    return toUserResponse(updatedUser!);
  }

  async updateRole(id: string, role: 'user' | 'admin'): Promise<UserResponse> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await userRepository.update(id, { role } as any);
    return toUserResponse(updatedUser!);
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    admins: number;
  }> {
    const total = await userRepository.count();
    const active = await userRepository.countByStatus(true);
    const inactive = total - active;
    const admins = await userRepository.countByRole('admin');

    return {
      total,
      active,
      inactive,
      admins,
    };
  }
}

export const userService = new UserService();
