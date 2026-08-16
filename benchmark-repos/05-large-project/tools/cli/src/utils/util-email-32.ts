import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'CLIutil32' });

export interface Options32 {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  timeout?: number;
  retries?: number;
}

export class EmailUtil32 {
  private options: Options32;

  constructor(options?: Options32) {
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

  getOptions(): Options32 { return { ...this.options }; }
}