import express, { type Express } from 'express';
import { devMessagesRouter } from './routes/devMessages.js';
import { importsRouter } from './routes/imports.js';
import type { Services } from './services.js';

export function createApp(services?: Services): Express {
  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (services) {
    app.use(importsRouter(services));
    if (services.config.enableDevRoutes) {
      app.use(devMessagesRouter(services.pipeline));
    }
  }

  return app;
}
