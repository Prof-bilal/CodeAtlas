import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'ImportCommand' });

export function registerImport2(program: Command): void {
  program
    .command('import-2')
    .description('Import command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running import');
      try {
        logger.info('Completed import', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed import', error as Error);
        process.exit(1);
      }
    });
}