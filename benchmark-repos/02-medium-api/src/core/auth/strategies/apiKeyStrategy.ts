import crypto from 'crypto';
import { apiKeyRepository } from '../../../repositories/apiKeyRepository.js';
import { ApiKey } from '../../../models/index.js';
import { authConfig } from '../../../config/auth.js';

export class ApiKeyStrategy {
  async verify(key: string): Promise<ApiKey> {
    const keyHash = this.hashKey(key);
    const apiKey = await apiKeyRepository.findByKeyHash(keyHash);
    
    if (!apiKey) {
      throw new Error('Invalid API key');
    }

    if (!apiKey.isActive) {
      throw new Error('API key is deactivated');
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      throw new Error('API key has expired');
    }

    await apiKeyRepository.updateLastUsed(apiKey.id);
    
    return apiKey;
  }

  async generate(userId: string, name: string, permissions: string[], expiresAt?: Date): Promise<{ key: string; apiKey: ApiKey }> {
    const rawKey = this.generateRawKey();
    const keyHash = this.hashKey(rawKey);
    
    const apiKey = await apiKeyRepository.create({
      userId,
      name,
      key: `${authConfig.apiKeyPrefix}${rawKey}`,
      keyHash,
      permissions,
      expiresAt,
    });

    return { key: `${authConfig.apiKeyPrefix}${rawKey}`, apiKey };
  }

  async revoke(id: string, userId: string): Promise<void> {
    const apiKey = await apiKeyRepository.findById(id);
    
    if (!apiKey || apiKey.userId !== userId) {
      throw new Error('API key not found');
    }

    await apiKeyRepository.deactivate(id);
  }

  async list(userId: string): Promise<ApiKey[]> {
    return apiKeyRepository.findByUserId(userId);
  }

  private generateRawKey(): string {
    return crypto.randomBytes(authConfig.apiKeyLength).toString('hex');
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

export const apiKeyStrategy = new ApiKeyStrategy();
