import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'RestoreCommand' });

export function registerRestore14(program: Command): void {
  program
    .command('restore-14')
    .description('Restore command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running restore');
      try {
        logger.info('Completed restore', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed restore', error as Error);
        process.exit(1);
      }
    });
}