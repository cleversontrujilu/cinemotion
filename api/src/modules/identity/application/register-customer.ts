import type { PasswordHasher, UserRepository } from '../domain/ports.js';
import { normalizeEmail, toPublicUser, type PublicUser } from '../domain/user.js';

export interface RegisterCustomerInput {
  email: string;
  password: string;
}

/**
 * Cadastro público: sempre cria `customer`. Administradores só existem via seed/migration.
 * A unicidade do e-mail é garantida pelo banco (sem SELECT prévio, sem corrida).
 */
export function registerCustomer(deps: { users: UserRepository; hasher: PasswordHasher }) {
  return async (input: RegisterCustomerInput): Promise<PublicUser> => {
    const passwordHash = await deps.hasher.hash(input.password);
    const user = await deps.users.create({
      email: normalizeEmail(input.email),
      passwordHash,
      role: 'customer',
    });
    return toPublicUser(user);
  };
}
