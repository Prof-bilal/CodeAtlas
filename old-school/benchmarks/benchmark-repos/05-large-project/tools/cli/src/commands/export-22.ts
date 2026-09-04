import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'ExportCommand' });

export function registerExport22(program: Command): void {
  program
    .command('export-22')
    .description('Export command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running export');
      try {
        logger.info('Completed export', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed export', error as Error);
        process.exit(1);
      }
    });
}