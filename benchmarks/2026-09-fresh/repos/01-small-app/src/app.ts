import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { serverConfig } from './config/auth.js';
import { errorHandler, notFoundHandler, requestLogger, securityHeaders } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: serverConfig.corsOrigins }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(securityHeaders);
  app.use(requestLogger);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
