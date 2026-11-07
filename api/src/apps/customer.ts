import type { Express } from 'express';
import { mountCatalogPublicRoutes } from '../modules/catalog/http/routes.js';
import { pgCatalogRepositories } from '../modules/catalog/infrastructure/pg-catalog-repositories.js';
import { createApp, type AppDeps } from './create-app.js';

/** API do Cliente: cadastro, sessões, mapa de ocupação e Reservas. */
export function createCustomerApp(deps: AppDeps): Express {
  return createApp('customer', deps, (router, ctx) => {
    mountCatalogPublicRoutes(router, { pool: ctx.pool, repos: pgCatalogRepositories, timezone: ctx.timezone });
    // As rotas de booking entram aqui.
  });
}
