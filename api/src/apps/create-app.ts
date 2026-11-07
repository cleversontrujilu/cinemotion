import express, { type Express, type Router } from 'express';
import type { Pool } from 'pg';
import { errorHandler, notFoundHandler } from '../shared/http/problem-details.js';

export interface AppDeps {
  pool: Pool;
}

/**
 * Base comum das duas APIs: JSON, health check, 404 e tradução de erros para
 * Problem Details. Cada API registra só as rotas do seu papel em `mountRoutes`.
 * CORS e throttling ficam no API Gateway.
 */
export function createApp(deps: AppDeps, mountRoutes: (router: Router) => void): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await deps.pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      console.error('[health] banco indisponível', err);
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  const router = express.Router();
  mountRoutes(router);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
