import { describe, it, expect } from 'vitest';
import { 
  UserSchema, CreateUserSchema, UpdateUserSchema,
  TaskSchema, CreateTaskSchema, UpdateTaskSchema,
  PaymentSchema, CreatePaymentSchema,
  SubscriptionSchema, CreateSubscriptionSchema,
  NotificationSchema, CreateNotificationSchema,
  ApiKeySchema, CreateApiKeySchema,
  WebhookSchema, CreateWebhookSchema,
  FileSchema, CreateFileSchema
} from '../src/types/schemas.js';

describe('Zod Schemas', () => {
  describe('UserSchema', () => {
    it('should validate valid user', () => {
      const user = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(() => UserSchema.parse(user)).not.toThrow();
    });
  });

  describe('CreateUserSchema', () => {
    it('should validate valid create user input', () => {
      const input = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      };
      expect(() => CreateUserSchema.parse(input)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const input = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'Password123!',
      };
      expect(() => CreateUserSchema.parse(input)).toThrow();
    });
  });

  describe('TaskSchema', () => {
    it('should validate valid task', () => {
      const task = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Task',
        status: 'pending',
        priority: 5,
        userId: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(() => TaskSchema.parse(task)).not.toThrow();
    });
  });

  describe('PaymentSchema', () => {
    it('should validate valid payment', () => {
      const payment = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        amount: 1000,
        currency: 'USD',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(() => PaymentSchema.parse(payment)).not.toThrow();
    });
  });
});
