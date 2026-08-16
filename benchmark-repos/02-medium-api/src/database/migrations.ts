import { databaseService } from './databaseService.js';
import { logger } from '../utils/logger.js';

export interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
  timestamp: Date;
}

export class MigrationRunner {
  private migrations: Migration[] = [];

  constructor() {
    this.registerMigrations();
  }

  private registerMigrations(): void {
    this.migrations = [
      {
        id: '001',
        name: 'create_users_table',
        up: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS users;',
        timestamp: new Date('2024-01-01'),
      },
      {
        id: '002',
        name: 'create_tasks_table',
        up: `
          CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(50) DEFAULT 'pending',
            priority INTEGER DEFAULT 0,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            assigned_to UUID REFERENCES users(id),
            due_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS tasks;',
        timestamp: new Date('2024-01-02'),
      },
      {
        id: '003',
        name: 'create_subscriptions_table',
        up: `
          CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            plan_id VARCHAR(100) NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            current_period_start TIMESTAMP,
            current_period_end TIMESTAMP,
            cancel_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS subscriptions;',
        timestamp: new Date('2024-01-03'),
      },
      {
        id: '004',
        name: 'create_payments_table',
        up: `
          CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            currency VARCHAR(3) DEFAULT 'USD',
            status VARCHAR(50) DEFAULT 'pending',
            payment_method VARCHAR(100),
            stripe_payment_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS payments;',
        timestamp: new Date('2024-01-04'),
      },
      {
        id: '005',
        name: 'create_notifications_table',
        up: `
          CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT,
            read BOOLEAN DEFAULT false,
            data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS notifications;',
        timestamp: new Date('2024-01-05'),
      },
      {
        id: '006',
        name: 'create_audit_logs_table',
        up: `
          CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(100) NOT NULL,
            resource VARCHAR(100) NOT NULL,
            resource_id VARCHAR(255),
            details JSONB,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS audit_logs;',
        timestamp: new Date('2024-01-06'),
      },
      {
        id: '007',
        name: 'create_api_keys_table',
        up: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            key_hash VARCHAR(255) NOT NULL,
            permissions JSONB DEFAULT '[]',
            last_used_at TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS api_keys;',
        timestamp: new Date('2024-01-07'),
      },
      {
        id: '008',
        name: 'create_files_table',
        up: `
          CREATE TABLE IF NOT EXISTS files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100),
            size INTEGER,
            path VARCHAR(1000),
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS files;',
        timestamp: new Date('2024-01-08'),
      },
      {
        id: '009',
        name: 'create_webhooks_table',
        up: `
          CREATE TABLE IF NOT EXISTS webhooks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            url VARCHAR(1000) NOT NULL,
            secret VARCHAR(255),
            events TEXT[] DEFAULT '{}',
            active BOOLEAN DEFAULT true,
            last_triggered_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS webhooks;',
        timestamp: new Date('2024-01-09'),
      },
      {
        id: '010',
        name: 'create_search_index_table',
        up: `
          CREATE TABLE IF NOT EXISTS search_index (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID NOT NULL,
            document_type VARCHAR(100) NOT NULL,
            title VARCHAR(255),
            content TEXT,
            metadata JSONB,
            tokens TSVECTOR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_search_tokens ON search_index USING GIN(tokens);
        `,
        down: 'DROP TABLE IF EXISTS search_index;',
        timestamp: new Date('2024-01-10'),
      },
    ];
  }

  async runMigrations(): Promise<void> {
    logger.info('Running migrations...');
    
    for (const migration of this.migrations) {
      try {
        await databaseService.query(migration.up);
        logger.info(`Migration ${migration.id} ${migration.name} applied`);
      } catch (error) {
        logger.error(`Migration ${migration.id} failed:`, error);
        throw error;
      }
    }
    
    logger.info('All migrations completed');
  }

  async rollbackMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.find(m => m.id === migrationId);
    
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }
    
    try {
      await databaseService.query(migration.down);
      logger.info(`Migration ${migration.id} ${migration.name} rolled back`);
    } catch (error) {
      logger.error(`Rollback of migration ${migration.id} failed:`, error);
      throw error;
    }
  }

  getPendingMigrations(): Migration[] {
    return this.migrations;
  }
}

export const migrationRunner = new MigrationRunner();
