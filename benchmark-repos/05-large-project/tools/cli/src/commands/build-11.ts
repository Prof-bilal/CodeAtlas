import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'BuildCommand' });

export function registerBuild11(program: Command): void {
  program
    .command('build-11')
    .description('Build command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running build');
      try {
        logger.info('Completed build', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed build', error as Error);
        process.exit(1);
      }
    });
}