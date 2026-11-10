import express, { type Express, type Router } from 'express';
import type { Pool } from 'pg';
import type { AuthConfig } from '../config/env.js';
import type { Role } from '../modules/identity/domain/user.js';
import type { TokenIssuer, TokenVerifier } from '../modules/identity/domain/ports.js';
import { mountAuthRoutes } from '../modules/identity/http/auth-routes.js';
import { bcryptPasswordHasher } from '../modules/identity/infrastructure/bcrypt-password-hasher.js';
import { jwtTokenService } from '../modules/identity/infrastructure/jwt-token-service.js';
import { pgUserRepository } from '../modules/identity/infrastructure/pg-user-repository.js';
import { systemClock, type Clock } from '../shared/domain/clock.js';
import { errorHandler, notFoundHandler } from '../shared/http/problem-details.js';

export interface AppDeps {
  pool: Pool;
  auth: AuthConfig;
  clock?: Clock;
  /** Fuso da rede (filtro por dia). Padrão: America/Sao_Paulo. */
  timezone?: string;
}

/**
 * Prefixo de cada API. Cada frontend chama a sua API no próprio domínio, em `/api/*`
 * (o CloudFront encaminha ao API Gateway; no ambiente local, o devProxy do Nuxt), sem CORS.
 * O admin fica em `/api/admin` para as duas APIs caberem num único documento OpenAPI,
 * sem caminhos repetidos.
 */
export const BASE_PATH: Record<Role, string> = { customer: '/api', admin: '/api/admin' };

/** O que cada API recebe para montar as rotas do seu papel. */
export interface AppContext {
  pool: Pool;
  clock: Clock;
  timezone: string;
  tokens: TokenIssuer & TokenVerifier;
}

/**
 * Base comum das duas APIs: JSON, prefixo do papel, health check, autenticação do papel, 404 e
 * tradução de erros para Problem Details. CORS e throttling ficam no API Gateway.
 */
export function createApp(
  role: Role,
  deps: AppDeps,
  mountRoutes: (router: Router, ctx: AppContext) => void,
): Express {
  const clock = deps.clock ?? systemClock;
  const tokens = jwtTokenService(role, { secret: deps.auth.secret, ttlSeconds: deps.auth.ttlSeconds }, clock);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const router = express.Router();
  router.get('/health', async (_req, res) => {
    try {
      await deps.pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      console.error('[health] banco indisponível', err);
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  mountAuthRoutes(router, {
    role,
    users: pgUserRepository(deps.pool),
    hasher: bcryptPasswordHasher(),
    tokens,
    allowRegister: role === 'customer',
  });
  mountRoutes(router, { pool: deps.pool, clock, tokens, timezone: deps.timezone ?? 'America/Sao_Paulo' });
  app.use(BASE_PATH[role], router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
