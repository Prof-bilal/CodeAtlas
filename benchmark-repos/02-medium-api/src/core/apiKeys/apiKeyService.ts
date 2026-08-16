import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import crypto from 'crypto';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  permissions: string[];
  active: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateApiKeyOptions {
  name: string;
  permissions?: string[];
  expiresIn?: number; // days
}

export class ApiKeyService {
  private apiKeys: ApiKey[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createApiKey(userId: string, name: string, permissions?: string[]): Promise<{ apiKey: ApiKey; plainKey: string }> {
    const plainKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    const apiKey: ApiKey = {
      id: uuidv4(),
      userId,
      name,
      keyHash,
      permissions: permissions || [],
      active: true,
      createdAt: new Date(),
    };

    this.apiKeys.push(apiKey);
    await cacheService.invalidate(`apikeys:${userId}`);
    this.eventBus.emit('apikey:created', { apiKeyId: apiKey.id, userId });

    return { apiKey, plainKey };
  }

  async getApiKey(id: string): Promise<ApiKey> {
    const apiKey = this.apiKeys.find(k => k.id === id);
    if (!apiKey) {
      throw new Error('API key not found');
    }
    return apiKey;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeys.filter(k => k.userId === userId);
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = this.apiKeys.find(k => k.keyHash === keyHash && k.active);
    
    if (apiKey) {
      apiKey.lastUsedAt = new Date();
    }

    return apiKey || null;
  }

  async revokeApiKey(id: string): Promise<void> {
    const apiKey = await this.getApiKey(id);
    apiKey.active = false;

    await cacheService.invalidate(`apikeys:${apiKey.userId}`);
    this.eventBus.emit('apikey:revoked', { apiKeyId: id, userId: apiKey.userId });
  }

  async deleteApiKey(id: string): Promise<void> {
    const index = this.apiKeys.findIndex(k => k.id === id);
    if (index === -1) {
      throw new Error('API key not found');
    }

    const [deletedKey] = this.apiKeys.splice(index, 1);
    await cacheService.invalidate(`apikeys:${deletedKey.userId}`);
    this.eventBus.emit('apikey:deleted', { apiKeyId: id, userId: deletedKey.userId });
  }

  async updatePermissions(id: string, permissions: string[]): Promise<ApiKey> {
    const apiKey = await this.getApiKey(id);
    apiKey.permissions = permissions;

    await cacheService.invalidate(`apikeys:${apiKey.userId}`);
    this.eventBus.emit('apikey:updated', { apiKeyId: id, userId: apiKey.userId });

    return apiKey;
  }
}

export const apiKeyService = new ApiKeyService(new EventBus());
