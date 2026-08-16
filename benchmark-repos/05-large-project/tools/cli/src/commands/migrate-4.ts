import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MigrateCommand' });

export function registerMigrate4(program: Command): void {
  program
    .command('migrate-4')
    .description('Migrate command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running migrate');
      try {
        logger.info('Completed migrate', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed migrate', error as Error);
        process.exit(1);
      }
    });
}