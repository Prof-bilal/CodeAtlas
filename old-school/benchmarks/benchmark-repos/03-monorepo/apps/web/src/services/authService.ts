import { ApiClient } from './apiClient.js';
import { LoginRequest, LoginResponse, RegisterRequest } from '../types/api.js';
import { User } from '../types/index.js';

export class AuthService {
  private apiClient: ApiClient;
  private currentUser: User | null = null;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.apiClient.post<LoginResponse>('/auth/login', request);
    if (response.success && response.data) {
      this.apiClient.setAccessToken(response.data.tokens.accessToken);
      this.currentUser = response.data.user;
      localStorage.setItem('refreshToken', response.data.tokens.refreshToken);
      return response.data;
    }
    throw new Error(response.error?.message || 'Login failed');
  }

  async register(request: RegisterRequest): Promise<LoginResponse> {
    const response = await this.apiClient.post<LoginResponse>('/auth/register', request);
    if (response.success && response.data) {
      this.apiClient.setAccessToken(response.data.tokens.accessToken);
      this.currentUser = response.data.user;
      localStorage.setItem('refreshToken', response.data.tokens.refreshToken);
      return response.data;
    }
    throw new Error(response.error?.message || 'Registration failed');
  }

  async logout(): Promise<void> {
    try {
      await this.apiClient.post('/auth/logout');
    } finally {
      this.apiClient.setAccessToken(null);
      this.currentUser = null;
      localStorage.removeItem('refreshToken');
    }
  }

  async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');
    const response = await this.apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken });
    if (response.success && response.data) {
      this.apiClient.setAccessToken(response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
    } else {
      throw new Error('Token refresh failed');
    }
  }

  async getProfile(): Promise<User> {
    const response = await this.apiClient.get<User>('/auth/profile');
    if (response.success && response.data) {
      this.currentUser = response.data;
      return response.data;
    }
    throw new Error(response.error?.message || 'Failed to get profile');
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    const response = await this.apiClient.patch<User>('/auth/profile', updates);
    if (response.success && response.data) {
      this.currentUser = response.data;
      return response.data;
    }
    throw new Error(response.error?.message || 'Failed to update profile');
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const response = await this.apiClient.post('/auth/change-password', { oldPassword, newPassword });
    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to change password');
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  hasRole(role: string): boolean {
    return this.currentUser?.role === role;
  }
}
