import type { Express } from 'express';
import { createApp, type AppDeps } from './create-app.js';

/** API do Administrador: gestão de Salas, Filmes e Sessões. */
export function createAdminApp(deps: AppDeps): Express {
  return createApp(deps, (_router) => {
    // As rotas dos módulos identity (login) e catalog (escrita) entram aqui.
  });
}
