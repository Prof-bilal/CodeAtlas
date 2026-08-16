import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'ReportsCommand' });

export function registerReports18(program: Command): void {
  program
    .command('reports-18')
    .description('Reports command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running reports');
      try {
        logger.info('Completed reports', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed reports', error as Error);
        process.exit(1);
      }
    });
}