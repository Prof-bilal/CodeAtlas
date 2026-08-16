import { generateApiKey, hashPassword, verifyPassword, generateToken } from '@monorepo/shared';

export interface ApiKey {
  id: string;
  userId: string;
  key: string;
  hash: string;
  name: string;
  scopes: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  isActive: boolean;
}

export interface CreateApiKeyRequest {
  userId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}

export class ApiKeyStrategy {
  private keys: Map<string, ApiKey> = new Map();
  private keyToId: Map<string, string> = new Map();

  createApiKey(request: CreateApiKeyRequest): { apiKey: ApiKey; rawKey: string } {
    const rawKey = generateApiKey();
    const { hash, salt } = hashPassword(rawKey);
    const apiKey: ApiKey = {
      id: generateToken(16),
      userId: request.userId,
      key: rawKey.split('_')[1],
      hash: `${hash}:${salt}`,
      name: request.name,
      scopes: request.scopes,
      expiresAt: request.expiresAt,
      createdAt: new Date(),
      isActive: true,
    };
    this.keys.set(apiKey.id, apiKey);
    this.keyToId.set(rawKey, apiKey.id);
    return { apiKey, rawKey };
  }

  validateApiKey(rawKey: string): ApiKeyValidationResult {
    const keyId = this.keyToId.get(rawKey);
    if (!keyId) {
      return { valid: false, error: 'Invalid API key' };
    }
    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return { valid: false, error: 'API key not found' };
    }
    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is inactive' };
    }
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }
    const [hash, salt] = apiKey.hash.split(':');
    if (!verifyPassword(rawKey, hash, salt)) {
      return { valid: false, error: 'Invalid API key' };
    }
    apiKey.lastUsedAt = new Date();
    return { valid: true, apiKey };
  }

  revokeApiKey(keyId: string): boolean {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) return false;
    apiKey.isActive = false;
    return true;
  }

  deleteApiKey(keyId: string): boolean {
    const apiKey = this.keys.get(keyId);
    if (!apiKey) return false;
    this.keys.delete(keyId);
    return true;
  }

  getApiKeyById(keyId: string): ApiKey | undefined {
    return this.keys.get(keyId);
  }

  getApiKeysByUser(userId: string): ApiKey[] {
    return Array.from(this.keys.values()).filter(k => k.userId === userId);
  }

  hasScope(apiKey: ApiKey, scope: string): boolean {
    return apiKey.scopes.includes('*') || apiKey.scopes.includes(scope);
  }

  revokeAllUserKeys(userId: string): number {
    let count = 0;
    for (const apiKey of this.keys.values()) {
      if (apiKey.userId === userId && apiKey.isActive) {
        apiKey.isActive = false;
        count++;
      }
    }
    return count;
  }

  cleanupExpiredKeys(): number {
    const now = new Date();
    let count = 0;
    for (const [id, apiKey] of this.keys.entries()) {
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < now) {
        this.keys.delete(id);
        this.keyToId.forEach((keyId, key) => {
          if (keyId === id) this.keyToId.delete(key);
        });
        count++;
      }
    }
    return count;
  }
}
