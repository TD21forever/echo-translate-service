import { startServer } from './server';
import { logger } from './utils/logger';

(async () => {
  try {
    await startServer();
    logger.info('startup', 'Video translate service ready');
  } catch (error) {
    logger.error('startup', 'Failed to start video translate service', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    process.exitCode = 1;
  }
})();
