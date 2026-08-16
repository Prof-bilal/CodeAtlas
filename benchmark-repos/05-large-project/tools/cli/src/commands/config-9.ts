import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'ConfigCommand' });

export function registerConfig9(program: Command): void {
  program
    .command('config-9')
    .description('Config command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running config');
      try {
        logger.info('Completed config', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed config', error as Error);
        process.exit(1);
      }
    });
}