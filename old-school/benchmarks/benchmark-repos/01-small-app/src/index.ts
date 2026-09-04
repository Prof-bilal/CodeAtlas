import { createApp } from './app.js';
import { serverConfig } from './config/auth.js';
import { closePool } from './config/database.js';

const app = createApp();

const server = app.listen(serverConfig.port, () => {
  console.log(`Server running on port ${serverConfig.port} in ${serverConfig.nodeEnv} mode`);
});

const shutdown = async () => {
  console.log('Shutting down gracefully...');
  
  server.close(async () => {
    await closePool();
    console.log('Server shut down');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

export { app };
