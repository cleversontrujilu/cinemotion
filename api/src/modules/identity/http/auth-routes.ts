import type { Router } from 'express';
import { z } from 'zod';
import { parseInput } from '../../../shared/http/validation.js';
import { login } from '../application/login.js';
import { registerCustomer } from '../application/register-customer.js';
import type { PasswordHasher, TokenIssuer, TokenVerifier, UserRepository } from '../domain/ports.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, type Role } from '../domain/user.js';
import { currentUser, requireAuth } from './require-auth.js';

const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1).max(1024),
});

const registerSchema = z.object({
  email: z.email().max(255),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .refine((p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX_BYTES, {
      message: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes.`,
    }),
});

export interface AuthRoutesDeps {
  role: Role;
  users: UserRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer & TokenVerifier;
  /** Só a API do Cliente expõe o cadastro. */
  allowRegister: boolean;
}

export function mountAuthRoutes(router: Router, deps: AuthRoutesDeps): void {
  const doLogin = login(deps);

  router.post('/auth/login', async (req, res) => {
    const input = parseInput(loginSchema, req.body);
    res.json(await doLogin(input));
  });

  if (deps.allowRegister) {
    const doRegister = registerCustomer(deps);
    router.post('/auth/register', async (req, res) => {
      const input = parseInput(registerSchema, req.body);
      res.status(201).json(await doRegister(input));
    });
  }

  router.get('/auth/me', requireAuth(deps.tokens), (req, res) => {
    res.json(currentUser(req));
  });
}
