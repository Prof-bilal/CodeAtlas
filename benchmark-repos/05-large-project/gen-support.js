// gen-support.js - Generates tests, config, docs, scripts, tools
const { ENTITIES, pick, write } = require('./gen-modules/utils');
const path = require('path');
const BASE = __dirname;
let count = 0;

// TESTS - ~200 files
const testsBase = path.join(BASE, 'tests');
for (let i = 0; i < 200; i++) {
  const entity = pick(ENTITIES);
  const type = pick(['unit','integration','e2e']);
  const domain = pick(['auth','payment','user','organization','project','task','notification','search','analytics','workflow','email','sms','push','webhook','integration','reporting','queue','cache','scheduler','monitor']);
  const el = entity.toLowerCase();
  
  write(path.join(testsBase, `${type}/${domain}/${el}-${type}-${i}.test.ts`), `import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('${entity} ${type.charAt(0).toUpperCase()+type.slice(1)} Test ${i}', () => {
  let mockService: any;
  let mockRepo: any;
  let mockLogger: any;

  beforeEach(() => {
    mockService = {
      execute: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      exists: vi.fn(),
      cache: new Map(),
      getMetrics: vi.fn().mockReturnValue({ requests: 0, errors: 0, avgDuration: 0 }),
    };
    mockRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      exists: vi.fn(),
    };
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('should execute operation successfully', async () => {
    const input = { id: 'test-1', operation: 'process', data: { name: 'Test' } };
    mockService.execute.mockResolvedValue({ ok: true, value: { processed: true } });
    const result = await mockService.execute(input);
    expect(result.ok).toBe(true);
  });

  it('should handle validation errors', async () => {
    const input = { operation: 'process', data: {} };
    mockService.execute.mockResolvedValue({ ok: false, error: new Error('Validation failed') });
    const result = await mockService.execute(input);
    expect(result.ok).toBe(false);
  });

  it('should handle concurrent requests', async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      id: \`test-\${i}\`,
      operation: 'process',
      data: { index: i },
    }));
    mockService.execute.mockImplementation(async (input: any) => ({
      ok: true,
      value: { id: input.id, processed: true },
    }));
    const results = await Promise.all(inputs.map(input => mockService.execute(input)));
    expect(results).toHaveLength(10);
    results.forEach((r: any) => expect(r.ok).toBe(true));
  });

  it('should respect rate limits', async () => {
    const input = { operation: 'process', data: {} };
    for (let i = 0; i < 105; i++) {
      mockService.execute.mockResolvedValueOnce({ ok: true, value: {} });
    }
    for (let i = 0; i < 100; i++) {
      await mockService.execute(input);
    }
    expect(mockService.execute).toHaveBeenCalledTimes(100);
  });

  it('should handle timeouts', async () => {
    mockService.execute.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 50);
    }));
    await expect(mockService.execute({ operation: 'process', data: {} })).rejects.toThrow('Timeout');
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    mockService.execute.mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Transient error');
      return { ok: true, value: { attempts } };
    });
    for (let i = 0; i < 3; i++) {
      try { await mockService.execute({ operation: 'process', data: {} }); } catch {}
    }
    expect(attempts).toBe(3);
  });

  it('should cache results', async () => {
    const key = 'test-key';
    mockService.cache.set(key, { value: { cached: true }, expiresAt: Date.now() + 300000 });
    expect(mockService.cache.get(key)).toBeDefined();
  });

  it('should invalidate cache', async () => {
    mockService.cache.set('test-1', { value: {}, expiresAt: Date.now() + 300000 });
    mockService.cache.set('test-2', { value: {}, expiresAt: Date.now() + 300000 });
    mockService.cache.clear();
    expect(mockService.cache.size).toBe(0);
  });

  it('should track metrics', async () => {
    const metrics = mockService.getMetrics();
    expect(metrics).toHaveProperty('requests');
    expect(metrics).toHaveProperty('errors');
    expect(metrics).toHaveProperty('avgDuration');
  });
});
`);
  count++;
}

// CONFIG - ~30 files
const configBase = path.join(BASE, 'config');
const configs = [
  ['database.json', JSON.stringify({ host: 'localhost', port: 5432, database: 'CodeAtlas', poolSize: 20, ssl: false }, null, 2)],
  ['redis.json', JSON.stringify({ host: 'localhost', port: 6379, db: 0, keyPrefix: 'codeatlas:', maxRetries: 3 }, null, 2)],
  ['auth.json', JSON.stringify({ accessTokenTTL: 3600, refreshTokenTTL: 2592000, maxSessions: 10, bcryptRounds: 12 }, null, 2)],
  ['email.json', JSON.stringify({ provider: 'sendgrid', apiKey: '', from: 'noreply@codeatlas.dev', templatesDir: './templates' }, null, 2)],
  ['sms.json', JSON.stringify({ provider: 'twilio', accountSid: '', authToken: '', from: '+1234567890' }, null, 2)],
  ['payment.json', JSON.stringify({ provider: 'stripe', secretKey: '', webhookSecret: '', currency: 'USD' }, null, 2)],
  ['storage.json', JSON.stringify({ provider: 's3', bucket: 'codeatlas-files', region: 'us-east-1', maxFileSize: 104857600 }, null, 2)],
  ['search.json', JSON.stringify({ provider: 'meilisearch', host: 'localhost', port: 7700, apiKey: '' }, null, 2)],
  ['queue.json', JSON.stringify({ provider: 'redis', host: 'localhost', port: 6379, defaultConcurrency: 5, maxRetries: 3 }, null, 2)],
  ['cache.json', JSON.stringify({ provider: 'redis', host: 'localhost', port: 6379, defaultTTL: 300000, maxMemory: '256mb' }, null, 2)],
  ['scheduler.json', JSON.stringify({ provider: 'node-cron', timezone: 'UTC', maxConcurrent: 10 }, null, 2)],
  ['monitoring.json', JSON.stringify({ provider: 'datadog', apiKey: '', appKey: '', tags: ['env:production'] }, null, 2)],
  ['webhooks.json', JSON.stringify({ maxRetries: 3, retryDelay: 5000, timeout: 30000, maxPayloadSize: 1048576 }, null, 2)],
  ['integrations.json', JSON.stringify({ timeout: 30000, retries: 3, circuitBreaker: { threshold: 5, resetTimeout: 30000 } }, null, 2)],
  ['rate-limit.json', JSON.stringify({ windowMs: 60000, maxRequests: 100, lockoutMs: 900000 }, null, 2)],
  ['cors.json', JSON.stringify({ origin: ['http://localhost:3000'], methods: ['GET','POST','PUT','DELETE'], credentials: true }, null, 2)],
  ['helmet.json', JSON.stringify({ contentSecurityPolicy: true, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: false }, null, 2)],
  ['compression.json', JSON.stringify({ level: 6, threshold: 1024, filter: 'gzip' }, null, 2)],
  ['logging.json', JSON.stringify({ level: 'info', format: 'json', transports: ['console','file'], redactFields: ['password','token'] }, null, 2)],
  ['validation.json', JSON.stringify({ stripUnknown: true, abortEarly: false, allowUnknown: true }, null, 2)],
  ['upload.json', JSON.stringify({ maxFileSize: 104857600, allowedTypes: ['image/*','application/pdf','text/*'], tempDir: './temp' }, null, 2)],
  ['email-templates.json', JSON.stringify({ welcome: { subject: 'Welcome', template: 'welcome' }, reset: { subject: 'Reset Password', template: 'reset' }, verify: { subject: 'Verify Email', template: 'verify' } }, null, 2)],
  ['sms-templates.json', JSON.stringify({ verify: { body: 'Your code is {{code}}' }, reset: { body: 'Your reset code is {{code}}' } }, null, 2)],
  ['notification-templates.json', JSON.stringify({ mention: { title: 'You were mentioned', body: '{{user}} mentioned you in {{context}}' }, assignment: { title: 'New assignment', body: 'You were assigned to {{task}}' } }, null, 2)],
  ['roles.json', JSON.stringify({ owner: { level: 6, permissions: ['*'] }, admin: { level: 5, permissions: ['admin:*','user:*','project:*'] }, member: { level: 3, permissions: ['project:read','task:*'] } }, null, 2)],
  ['features.json', JSON.stringify({ enableSSO: true, enable2FA: true, enableWebhooks: true, enableAI: false, enableBeta: false }, null, 2)],
  ['limits.json', JSON.stringify({ maxUploadSize: 104857600, maxQueryResults: 1000, maxBulkOperations: 100, maxApiKeys: 10, maxWebhooks: 50 }, null, 2)],
  ['maintenance.json', JSON.stringify({ enabled: false, message: 'System under maintenance', allowedIPs: ['127.0.0.1'], estimatedDuration: 3600 }, null, 2)],
  ['backup.json', JSON.stringify({ enabled: true, schedule: '0 2 * * *', retention: 30, compression: true, destination: '/backups' }, null, 2)],
  ['security.json', JSON.stringify({ passwordMinLength: 8, passwordRequireUppercase: true, passwordRequireNumbers: true, passwordRequireSpecial: true, maxLoginAttempts: 5, lockoutDuration: 900000 }, null, 2)],
];

for (const [name, content] of configs) {
  write(path.join(configBase, name), content);
  count++;
}

// DOCS - ~30 files
const docsBase = path.join(BASE, 'docs');
const docFiles = [
  ['README.md', '# CodeAtlas Mega Platform\n\nA large-scale enterprise platform for benchmarking CodeAtlas.\n\n## Structure\n\n- `apps/` - Application packages (web, api, admin, mobile-api, worker)\n- `packages/` - Shared packages (core, auth, database, payments, etc.)\n- `tools/` - CLI tools and scripts\n- `config/` - Configuration files\n- `tests/` - Test suites\n\n## Getting Started\n\n```bash\npnpm install\npnpm build\npnpm dev\n```\n\n## Architecture\n\nThis project follows a clean architecture pattern with:\n- Domain-driven design\n- Event-driven architecture\n- CQRS pattern\n- Repository pattern\n- Service layer pattern\n\n## Packages\n\n| Package | Description | Files |\n|---------|-------------|-------|\n| @atlas/core | Core domain entities and ports | 278 |\n| @atlas/auth | Authentication and authorization | 150 |\n| @atlas/database | Database access layer | 200 |\n| @atlas/payments | Payment processing | 150 |\n| @atlas/notifications | Notification services | 100 |\n| @atlas/analytics | Analytics and tracking | 150 |\n| @atlas/search | Search and indexing | 100 |\n| @atlas/storage | File storage | 100 |\n| @atlas/email | Email services | 80 |\n| @atlas/sms | SMS services | 60 |\n| @atlas/push | Push notifications | 60 |\n| @atlas/webhooks | Webhook management | 80 |\n| @atlas/integrations | Third-party integrations | 120 |\n| @atlas/reporting | Report generation | 120 |\n| @atlas/workflow | Workflow engine | 100 |\n| @atlas/permissions | Permission management | 80 |\n| @atlas/audit | Audit logging | 80 |\n| @atlas/config | Configuration management | 60 |\n| @atlas/logging | Structured logging | 60 |\n| @atlas/caching | Caching layer | 60 |\n| @atlas/queue | Queue management | 80 |\n| @atlas/scheduler | Job scheduling | 60 |\n| @atlas/monitoring | System monitoring | 80 |\n| @atlas/ui | UI components | 400 |\n| @atlas/shared | Shared utilities | 180 |\n| @atlas/types | TypeScript types | 70 |\n'],
  ['ARCHITECTURE.md', '# Architecture\n\n## Overview\n\nThe CodeAtlas Mega Platform follows a modular monorepo architecture with clear separation of concerns.\n\n## Design Patterns\n\n### Domain-Driven Design\nEach package represents a bounded context with its own domain model.\n\n### Event-Driven Architecture\nCross-package communication happens through domain events via the EventBus.\n\n### Repository Pattern\nData access is abstracted behind repository interfaces.\n\n### Service Layer\nBusiness logic lives in service classes that depend on repositories and ports.\n\n### Ports and Adapters\nExternal integrations are behind port interfaces with pluggable adapters.\n\n## Data Flow\n\n```\nRequest → Auth → Rate Limit → Controller → Service → Repository → Database\n                                  ↓\n                              EventBus → Other Services\n                                  ↓\n                              Response\n```\n\n## Security\n\n- JWT-based authentication\n- Role-based access control\n- Rate limiting\n- Input validation\n- SQL injection prevention\n- XSS protection\n- CSRF protection\n'],
  ['API.md', '# API Documentation\n\n## Base URL\n\n```\n/api/v1\n```\n\n## Authentication\n\nAll API requests require a Bearer token in the Authorization header.\n\n```\nAuthorization: Bearer <token>\n```\n\n## Endpoints\n\n### Users\n\n- `GET /users` - List users\n- `GET /users/:id` - Get user\n- `POST /users` - Create user\n- `PUT /users/:id` - Update user\n- `DELETE /users/:id` - Delete user\n\n### Organizations\n\n- `GET /organizations` - List organizations\n- `GET /organizations/:id` - Get organization\n- `POST /organizations` - Create organization\n- `PUT /organizations/:id` - Update organization\n- `DELETE /organizations/:id` - Delete organization\n\n### Projects\n\n- `GET /projects` - List projects\n- `GET /projects/:id` - Get project\n- `POST /projects` - Create project\n- `PUT /projects/:id` - Update project\n- `DELETE /projects/:id` - Delete project\n\n### Tasks\n\n- `GET /tasks` - List tasks\n- `GET /tasks/:id` - Get task\n- `POST /tasks` - Create task\n- `PUT /tasks/:id` - Update task\n- `DELETE /tasks/:id` - Delete task\n\n## Rate Limiting\n\nAPI requests are rate limited to 100 requests per minute per user.\n\n## Error Codes\n\n- `400` - Bad Request\n- `401` - Unauthorized\n- `403` - Forbidden\n- `404` - Not Found\n- `409` - Conflict\n- `422` - Validation Error\n- `429` - Rate Limited\n- `500` - Internal Server Error\n'],
  ['DEPLOYMENT.md', '# Deployment Guide\n\n## Prerequisites\n\n- Node.js >= 20.19.0\n- PostgreSQL >= 15\n- Redis >= 7\n- pnpm >= 8.0.0\n\n## Environment Variables\n\nCopy `.env.example` to `.env` and configure:\n\n```bash\ncp .env.example .env\n```\n\n## Build\n\n```bash\npnpm install\npnpm build\n```\n\n## Deploy\n\n```bash\npnpm deploy\n```\n\n## Health Checks\n\n```bash\ncurl http://localhost:3000/health\n```\n\n## Monitoring\n\n- Logs: `/var/log/codeatlas/`\n- Metrics: Datadog APM\n- Alerts: PagerDuty integration\n'],
  ['CONTRIBUTING.md', '# Contributing\n\n## Development Setup\n\n1. Fork the repository\n2. Clone your fork\n3. Install dependencies: `pnpm install`\n4. Start development: `pnpm dev`\n\n## Code Style\n\n- TypeScript strict mode\n- ESLint for linting\n- Prettier for formatting\n- Conventional commits\n\n## Testing\n\n```bash\npnpm test          # Run all tests\npnpm test:unit     # Unit tests\npnpm test:integration  # Integration tests\npnpm test:e2e      # E2E tests\n```\n\n## Pull Request Process\n\n1. Create a feature branch\n2. Make your changes\n3. Add tests\n4. Update documentation\n5. Submit a pull request\n\n## Code Review\n\nAll pull requests require at least one review before merging.\n'],
];

for (const [name, content] of docFiles) {
  write(path.join(docsBase, name), content);
  count++;
}

// SCRIPTS - ~20 files
const scriptsBase = path.join(BASE, 'scripts');
for (let i = 0; i < 20; i++) {
  const type = pick(['deploy','seed','migrate','backup','restore','cleanup','sync','export','import','verify']);
  write(path.join(scriptsBase, `${type}-${i}.ts`), `#!/usr/bin/env node

import { Logger } from '@atlas/shared';

const logger = new Logger({ context: '${type.charAt(0).toUpperCase()+type.slice(1)}Script${i}' });

interface ScriptConfig {
  dryRun: boolean;
  verbose: boolean;
  timeout: number;
  retries: number;
}

async function main(config: ScriptConfig): Promise<void> {
  logger.info('${type.charAt(0).toUpperCase()+type.slice(1)} script started');
  const start = Date.now();
  
  try {
    if (config.dryRun) {
      logger.info('Dry run mode - no changes will be made');
    }
    
    logger.info('Processing...');
    await new Promise(r => setTimeout(r, 100));
    
    const duration = Date.now() - start;
    logger.info('${type.charAt(0).toUpperCase()+type.slice(1)} completed', { duration });
  } catch (error) {
    logger.error('${type.charAt(0).toUpperCase()+type.slice(1)} failed', error as Error);
    process.exit(1);
  }
}

const config: ScriptConfig = {
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  timeout: parseInt(process.env.TIMEOUT ?? '30000'),
  retries: parseInt(process.env.RETRIES ?? '3'),
};

main(config).catch(console.error);
`);
  count++;
}

// TOOLS/CLI - ~100 files
const cliBase = path.join(BASE, 'tools/cli/src');
for (let i = 0; i < 30; i++) {
  const cmd = pick(['init','build','deploy','migrate','seed','backup','restore','export','import','verify','status','health','metrics','logs','config','users','organizations','projects','tasks','reports']);
  write(path.join(cliBase, `commands/${cmd}-${i}.ts`), `import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: '${cmd.charAt(0).toUpperCase()+cmd.slice(1)}Command' });

export function register${cmd.charAt(0).toUpperCase()+cmd.slice(1)}${i}(program: Command): void {
  program
    .command('${cmd}${i > 0 ? '-' + i : ''}')
    .description('${cmd.charAt(0).toUpperCase()+cmd.slice(1)} command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running ${cmd}');
      try {
        logger.info('Completed ${cmd}', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed ${cmd}', error as Error);
        process.exit(1);
      }
    });
}`);
  count++;
}

for (let i = 0; i < 70; i++) {
  const type = pick(['command','util','helper','config','parser','formatter','validator','generator','template','adapter']);
  const domain = pick(ENTITIES);
  write(path.join(cliBase, `utils/${type.toLowerCase()}-${domain.toLowerCase()}-${i}.ts`), `import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'CLI${type}${i}' });

export interface Options${i} {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  timeout?: number;
  retries?: number;
}

export class ${domain}${type.charAt(0).toUpperCase()+type.slice(1)}${i} {
  private options: Options${i};

  constructor(options?: Options${i}) {
    this.options = { verbose: false, dryRun: false, force: false, timeout: 30000, retries: 3, ...options };
  }

  async execute(input: string): Promise<string> {
    logger.debug('Executing');
    if (this.options.dryRun) {
      logger.debug('Dry run - no changes');
      return input;
    }
    const result = await this.process(input);
    logger.debug('Completed');
    return result;
  }

  private async process(input: string): Promise<string> {
    return input + '-processed';
  }

  getOptions(): Options${i} { return { ...this.options }; }
}`);
  count++;
}

// TOOLS/SCRIPTS - ~50 files
const toolsScriptsBase = path.join(BASE, 'tools/scripts/src');
for (let i = 0; i < 50; i++) {
  const type = pick(['build','deploy','test','lint','format','analyze','audit','benchmark','profile','optimize']);
  write(path.join(toolsScriptsBase, `${type}-${i}.ts`), `import { Logger } from '@atlas/shared';

const logger = new Logger({ context: '${type.charAt(0).toUpperCase()+type.slice(1)}Script${i}' });

interface Config${i} { input: string; output: string; options: Record<string, unknown>; }

export async function run${type.charAt(0).toUpperCase()+type.slice(1)}${i}(config: Config${i}): Promise<{ success: boolean; duration: number; output?: string; error?: string }> {
  const start = Date.now();
  logger.info('Running ${type}');
  try {
    await new Promise(r => setTimeout(r, 50));
    const duration = Date.now() - start;
    logger.info('Completed', { duration });
    return { success: true, duration, output: config.output };
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Failed', error as Error);
    return { success: false, duration, error: (error as Error).message };
  }
}`);
  count++;
}

// TOOLS/GENERATORS - ~50 files
const genBase = path.join(BASE, 'tools/generators/src');
for (let i = 0; i < 50; i++) {
  const type = pick(['component','service','repository','controller','middleware','handler','validator','test','migration','seed']);
  const domain = pick(ENTITIES);
  write(path.join(genBase, `${type.toLowerCase()}-generator-${i}.ts`), `import { Logger } from '@atlas/shared';

const logger = new Logger({ context: '${type.charAt(0).toUpperCase()+type.slice(1)}Generator${i}' });

interface Template${i} { name: string; content: string; variables: Record<string, string>; }

export class ${domain}${type.charAt(0).toUpperCase()+type.slice(1)}Generator${i} {
  private templates: Template${i}[] = [];

  constructor(private outputDir: string) {}

  async generate(name: string, variables: Record<string, string>): Promise<string[]> {
    logger.info('Generating ${type}: ' + name);
    const generated: string[] = [];
    for (const template of this.templates) {
      let content = template.content;
      for (const [key, value] of Object.entries({ ...variables, ...template.variables })) {
        content = content.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), value);
      }
      const fileName = template.name.replace('{name}', name);
      generated.push(fileName);
    }
    logger.info('Generated ' + generated.length + ' files');
    return generated;
  }

  addTemplate(template: Template${i}): void { this.templates.push(template); }
  getTemplates(): Template${i}[] { return [...this.templates]; }
}`);
  count++;
}

console.log('Support created: ' + count + ' files');
