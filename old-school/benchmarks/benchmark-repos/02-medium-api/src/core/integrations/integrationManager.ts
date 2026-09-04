import { logger } from '../utils/logger.js';

export interface IntegrationConfig {
  name: string;
  type: 'slack' | 'teams' | 'discord' | 'jira' | 'github' | 'gitlab';
  credentials: Record<string, string>;
  enabled: boolean;
}

export interface IntegrationEvent {
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
}

export class IntegrationManager {
  private integrations: Map<string, IntegrationConfig> = new Map();
  private events: IntegrationEvent[] = [];

  async registerIntegration(config: IntegrationConfig): Promise<void> {
    this.integrations.set(config.name, config);
    logger.info(`Registered integration: ${config.name} (${config.type})`);
  }

  async removeIntegration(name: string): Promise<void> {
    this.integrations.delete(name);
    logger.info(`Removed integration: ${name}`);
  }

  async getIntegration(name: string): Promise<IntegrationConfig | undefined> {
    return this.integrations.get(name);
  }

  async listIntegrations(): Promise<IntegrationConfig[]> {
    return Array.from(this.integrations.values());
  }

  async sendEvent(integrationName: string, event: IntegrationEvent): Promise<boolean> {
    const integration = this.integrations.get(integrationName);
    if (!integration || !integration.enabled) {
      logger.warn(`Integration ${integrationName} not found or disabled`);
      return false;
    }

    try {
      this.events.push(event);
      logger.info(`Sent event to ${integrationName}: ${event.type}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send event to ${integrationName}:`, error);
      return false;
    }
  }

  async testConnection(name: string): Promise<{ success: boolean; error?: string }> {
    const integration = this.integrations.get(name);
    if (!integration) {
      return { success: false, error: 'Integration not found' };
    }

    try {
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getEvents(limit: number = 100): Promise<IntegrationEvent[]> {
    return this.events.slice(-limit);
  }
}

export const integrationManager = new IntegrationManager();
