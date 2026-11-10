import type { Express } from 'express';
import { mountBookingRoutes } from '../modules/booking/http/routes.js';
import { pgBookingRepository } from '../modules/booking/infrastructure/pg-booking-repository.js';
import { mountCatalogPublicRoutes } from '../modules/catalog/http/routes.js';
import { pgCatalogRepositories } from '../modules/catalog/infrastructure/pg-catalog-repositories.js';
import { createApp, type AppDeps } from './create-app.js';

/** API do Cliente: cadastro, sessões, mapa de ocupação e Reservas. */
export function createCustomerApp(deps: AppDeps): Express {
  return createApp('customer', deps, (router, ctx) => {
    mountCatalogPublicRoutes(router, { pool: ctx.pool, repos: pgCatalogRepositories, timezone: ctx.timezone });
    mountBookingRoutes(router, { pool: ctx.pool, repo: pgBookingRepository, tokens: ctx.tokens });
  });
}
