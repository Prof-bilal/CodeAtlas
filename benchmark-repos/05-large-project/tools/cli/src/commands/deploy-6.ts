import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'DeployCommand' });

export function registerDeploy6(program: Command): void {
  program
    .command('deploy-6')
    .description('Deploy command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running deploy');
      try {
        logger.info('Completed deploy', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed deploy', error as Error);
        process.exit(1);
      }
    });
}