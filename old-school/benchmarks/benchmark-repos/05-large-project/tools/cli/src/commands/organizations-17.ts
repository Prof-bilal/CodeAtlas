import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'OrganizationsCommand' });

export function registerOrganizations17(program: Command): void {
  program
    .command('organizations-17')
    .description('Organizations command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running organizations');
      try {
        logger.info('Completed organizations', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed organizations', error as Error);
        process.exit(1);
      }
    });
}