import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MetricsCommand' });

export function registerMetrics20(program: Command): void {
  program
    .command('metrics-20')
    .description('Metrics command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running metrics');
      try {
        logger.info('Completed metrics', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed metrics', error as Error);
        process.exit(1);
      }
    });
}