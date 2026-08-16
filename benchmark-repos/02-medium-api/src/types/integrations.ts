export interface Integration {
  id: string;
  userId: string;
  type: string;
  name: string;
  config: Record<string, any>;
  active: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIntegrationInput {
  type: string;
  name: string;
  config: Record<string, any>;
}

export interface UpdateIntegrationInput {
  name?: string;
  config?: Record<string, any>;
  active?: boolean;
}

export interface IntegrationType {
  id: string;
  name: string;
  description: string;
  icon: string;
  configSchema: Record<string, any>;
  authType: 'none' | 'oauth' | 'api_key' | 'basic';
}

export interface IntegrationSyncResult {
  success: boolean;
  syncedCount: number;
  errorCount: number;
  errors?: string[];
  duration: number;
}

export interface IntegrationLog {
  id: string;
  integrationId: string;
  action: string;
  status: 'success' | 'failed';
  details?: Record<string, any>;
  error?: string;
  duration: number;
  createdAt: Date;
}

export const INTEGRATION_TYPES: IntegrationType[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Sync with GitHub repositories',
    icon: 'github',
    configSchema: {
      token: { type: 'string', required: true },
      repository: { type: 'string', required: true },
    },
    authType: 'api_key',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send notifications to Slack',
    icon: 'slack',
    configSchema: {
      webhookUrl: { type: 'string', required: true },
      channel: { type: 'string', required: false },
    },
    authType: 'api_key',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Sync with Jira issues',
    icon: 'jira',
    configSchema: {
      host: { type: 'string', required: true },
      email: { type: 'string', required: true },
      apiToken: { type: 'string', required: true },
      projectKey: { type: 'string', required: true },
    },
    authType: 'basic',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Integrate with Google services',
    icon: 'google',
    configSchema: {
      clientId: { type: 'string', required: true },
      clientSecret: { type: 'string', required: true },
    },
    authType: 'oauth',
  },
];

export const INTEGRATION_ACTIONS = [
  'sync',
  'import',
  'export',
  'connect',
  'disconnect',
] as const;

export type IntegrationAction = typeof INTEGRATION_ACTIONS[number];
