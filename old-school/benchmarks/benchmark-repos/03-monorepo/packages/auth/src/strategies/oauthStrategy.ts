import { generateToken, generateUuid } from '@monorepo/shared';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: string;
  providerAccountId: string;
}

export interface OAuthState {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: Date;
}

export class OAuthStrategy {
  private configs: Map<string, OAuthConfig> = new Map();
  private states: Map<string, OAuthState> = new Map();

  registerProvider(provider: string, config: OAuthConfig): void {
    this.configs.set(provider, config);
  }

  generateAuthorizationUrl(provider: string): { url: string; state: string } {
    const config = this.configs.get(provider);
    if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);
    const state = generateToken(32);
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    this.states.set(state, {
      state,
      redirectUri: config.redirectUri,
      createdAt: new Date(),
    });
    return { url: `${config.authorizationUrl}?${params.toString()}`, state };
  }

  async exchangeCode(provider: string, code: string, state: string): Promise<OAuthTokens> {
    const stateData = this.states.get(state);
    if (!stateData) throw new Error('Invalid or expired OAuth state');
    this.states.delete(state);
    const config = this.configs.get(provider);
    if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: stateData.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
      scope: data.scope as string,
    };
  }

  async refreshAccessToken(provider: string, refreshToken: string): Promise<OAuthTokens> {
    const config = this.configs.get(provider);
    if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`OAuth token refresh failed: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) || refreshToken,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
      scope: data.scope as string,
    };
  }

  async getUserInfo(provider: string, accessToken: string): Promise<OAuthUserInfo> {
    const config = this.configs.get(provider);
    if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);
    const response = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, unknown>;
    return this.mapUserInfo(provider, data);
  }

  private mapUserInfo(provider: string, data: Record<string, unknown>): OAuthUserInfo {
    const mappings: Record<string, { id: string; email: string; name: string; avatar?: string }> = {
      google: { id: 'sub', email: 'email', name: 'name', avatar: 'picture' },
      github: { id: 'id', email: 'email', name: 'name', avatar: 'avatar_url' },
      facebook: { id: 'id', email: 'email', name: 'name', avatar: 'picture' },
    };
    const mapping = mappings[provider] || { id: 'id', email: 'email', name: 'name' };
    return {
      id: String(data[mapping.id]),
      email: String(data[mapping.email]),
      name: String(data[mapping.name]),
      avatar: mapping.avatar ? String(data[mapping.avatar]) : undefined,
      provider,
      providerAccountId: String(data[mapping.id]),
    };
  }

  cleanupExpiredStates(): number {
    const now = new Date();
    let count = 0;
    for (const [state, data] of this.states.entries()) {
      const age = now.getTime() - data.createdAt.getTime();
      if (age > 10 * 60 * 1000) {
        this.states.delete(state);
        count++;
      }
    }
    return count;
  }
}
