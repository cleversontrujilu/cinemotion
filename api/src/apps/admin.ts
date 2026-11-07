import type { Express } from 'express';
import { createApp, type AppDeps } from './create-app.js';

/** API do Administrador: gestão de Salas, Filmes e Sessões. */
export function createAdminApp(deps: AppDeps): Express {
  return createApp('admin', deps, (_router, _ctx) => {
    // As rotas de catalog (escrita), protegidas por requireAuth(ctx.tokens), entram aqui.
  });
}
