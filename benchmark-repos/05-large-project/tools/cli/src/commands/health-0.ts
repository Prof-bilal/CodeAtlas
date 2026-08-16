import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'HealthCommand' });

export function registerHealth0(program: Command): void {
  program
    .command('health')
    .description('Health command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running health');
      try {
        logger.info('Completed health', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed health', error as Error);
        process.exit(1);
      }
    });
}