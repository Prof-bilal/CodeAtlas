import { ApiKeyRepository } from '../database/repositories/apiKeyRepository.js';
import { generateRandomString, hashString } from '../../utils/crypto.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface ApiKeyService {
  getApiKey(id: string): Promise<any>;
  getUserApiKeys(userId: string): Promise<any[]>;
  createApiKey(userId: string, name: string, permissions?: string[]): Promise<any>;
  validateApiKey(key: string): Promise<any>;
  revokeApiKey(id: string): Promise<boolean>;
  updateLastUsed(id: string): Promise<void>;
}

export class ApiKeyServiceImpl implements ApiKeyService {
  private apiKeyRepository: ApiKeyRepository;

  constructor() {
    this.apiKeyRepository = new ApiKeyRepository();
  }

  async getApiKey(id: string): Promise<any> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new Error('API key not found');
    }
    return apiKey;
  }

  async getUserApiKeys(userId: string): Promise<any[]> {
    return this.apiKeyRepository.findByUserId(userId);
  }

  async createApiKey(userId: string, name: string, permissions: string[] = []): Promise<any> {
    const rawKey = generateRandomString(32);
    const keyHash = hashString(rawKey);

    const apiKey = await this.apiKeyRepository.create({
      userId,
      name,
      keyHash,
      permissions,
    });

    await eventBus.publish('apikey.created', {
      apiKeyId: apiKey.id,
      userId,
      name,
      permissions,
    }, 'apikey-service');

    return {
      ...apiKey,
      rawKey,
    };
  }

  async validateApiKey(key: string): Promise<any> {
    const keyHash = hashString(key);
    const apiKey = await this.apiKeyRepository.findByKeyHash(keyHash);

    if (!apiKey) {
      return null;
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    await this.apiKeyRepository.updateLastUsed(apiKey.id);

    return apiKey;
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new Error('API key not found');
    }

    const deleted = await this.apiKeyRepository.delete(id);

    await eventBus.publish('apikey.revoked', {
      apiKeyId: id,
      userId: apiKey.userId,
    }, 'apikey-service');

    return deleted;
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.apiKeyRepository.updateLastUsed(id);
  }
}

export const apiKeyService = new ApiKeyServiceImpl();
