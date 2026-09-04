import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'BackupCommand' });

export function registerBackup7(program: Command): void {
  program
    .command('backup-7')
    .description('Backup command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running backup');
      try {
        logger.info('Completed backup', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed backup', error as Error);
        process.exit(1);
      }
    });
}