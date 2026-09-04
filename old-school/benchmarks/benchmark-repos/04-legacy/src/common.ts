// Common types and interfaces
// Shared across the application

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorDetails {
  field: string;
  message: string;
  code: string;
}

export interface ValidationError extends ErrorDetails {
  received: unknown;
  expected: unknown;
}

// User types (duplicated in userService.ts)
export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
}

// Payment types (duplicated in payments.ts and paymentService.ts)
export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

// Auth types (duplicated in auth.ts and authV2.ts)
export interface AuthToken {
  token: string;
  expiresAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

// Event types
export interface DomainEvent {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}

// Configuration types
export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  stripeKey: string;
  logLevel: string;
}

// Environment types
export type Environment = 'development' | 'staging' | 'production' | 'test';

// HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Sorting
export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

// Filtering
export interface FilterOptions {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: any;
}

// TODO: these are legacy types, remove when migration is complete
export interface LegacyUser {
  id: number;
  username: string;
  email: string;
  password: string;
  role: string;
}

export interface LegacyPayment {
  id: number;
  userId: number;
  amount: number;
  status: string;
}
