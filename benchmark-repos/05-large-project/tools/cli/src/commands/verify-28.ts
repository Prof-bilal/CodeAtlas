import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'VerifyCommand' });

export function registerVerify28(program: Command): void {
  program
    .command('verify-28')
    .description('Verify command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running verify');
      try {
        logger.info('Completed verify', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed verify', error as Error);
        process.exit(1);
      }
    });
}