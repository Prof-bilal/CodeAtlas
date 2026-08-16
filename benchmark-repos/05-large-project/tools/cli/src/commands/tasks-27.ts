import { Command } from 'commander';
import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'TasksCommand' });

export function registerTasks27(program: Command): void {
  program
    .command('tasks-27')
    .description('Tasks command')
    .option('-d, --dry-run', 'Dry run mode')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force execution')
    .action(async (options) => {
      const start = Date.now();
      logger.info('Running tasks');
      try {
        logger.info('Completed tasks', { duration: Date.now() - start });
      } catch (error) {
        logger.error('Failed tasks', error as Error);
        process.exit(1);
      }
    });
}