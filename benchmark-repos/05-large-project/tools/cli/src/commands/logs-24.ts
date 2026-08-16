import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'LogsCommand' });

export function registerLogs24(program: Command): void {
  program
    .command('logs-24')
    .description('Logs command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running logs');
      try {
        logger.info('Completed logs', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed logs', error as Error);
        process.exit(1);
      }
    });
}