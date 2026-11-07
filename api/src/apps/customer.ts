import type { Express } from 'express';
import { createApp, type AppDeps } from './create-app.js';

/** API do Cliente: cadastro, sessões, mapa de ocupação e Reservas. */
export function createCustomerApp(deps: AppDeps): Express {
  return createApp(deps, (_router) => {
    // As rotas dos módulos identity, catalog (leitura) e booking entram aqui.
  });
}
