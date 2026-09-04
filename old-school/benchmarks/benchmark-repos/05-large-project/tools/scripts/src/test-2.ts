import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'TestScript2' });

interface Config2 { input: string; output: string; options: Record<string, unknown>; }

export async function runTest2(config: Config2): Promise<{ success: boolean; duration: number; output?: string; error?: string }> {
  const start = Date.now();
  logger.info('Running test');
  try {
    await new Promise(r => setTimeout(r, 50));
    const duration = Date.now() - start;
    logger.info('Completed', { duration });
    return { success: true, duration, output: config.output };
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Failed', error as Error);
    return { success: false, duration, error: (error as Error).message };
  }
}