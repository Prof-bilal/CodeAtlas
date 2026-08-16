import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'CLIhelper30' });

export interface Options30 {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  timeout?: number;
  retries?: number;
}

export class UserHelper30 {
  private options: Options30;

  constructor(options?: Options30) {
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

  getOptions(): Options30 { return { ...this.options }; }
}