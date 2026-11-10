import type { Express } from 'express';
import { mountCatalogAdminRoutes } from '../modules/catalog/http/routes.js';
import { pgCatalogRepositories } from '../modules/catalog/infrastructure/pg-catalog-repositories.js';
import { createApp, type AppDeps } from './create-app.js';

/** API do Administrador: gestão de Salas, Filmes e Sessões. */
export function createAdminApp(deps: AppDeps): Express {
  return createApp('admin', deps, (router, ctx) => {
    mountCatalogAdminRoutes(router, {
      pool: ctx.pool,
      repos: pgCatalogRepositories,
      timezone: ctx.timezone,
      tokens: ctx.tokens,
    });
  });
}
