import type { Request, RequestHandler } from 'express';
import { DomainError } from '../../../shared/domain/errors.js';
import type { AuthenticatedUser, TokenVerifier } from '../domain/ports.js';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido por requireAuth. */
      auth?: AuthenticatedUser;
    }
  }
}

const missingToken = () =>
  new DomainError('unauthorized', 'missing-token', 'Envie o token no cabeçalho Authorization: Bearer <token>.');

/** Exige `Authorization: Bearer <token>` válido para a audiência desta API. */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw missingToken();
    req.auth = await verifier.verify(token);
    next();
  };
}

/** Usuário autenticado da requisição. Só use em rotas protegidas por requireAuth. */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.auth) throw missingToken();
  return req.auth;
}
