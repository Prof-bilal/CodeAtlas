import { Logger } from '@atlas/shared';
export abstract class BaseService {
  protected logger: Logger;
  constructor(context: string) { this.logger = new Logger({ context }); }
  protected async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try { const r = await fn(); this.logger.debug('Done ' + operation, { duration: Date.now() - start }); return r; }
    catch (e) { this.logger.error('Failed ' + operation, e as Error); throw e; }
  }
}