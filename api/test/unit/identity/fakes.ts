import type { PasswordHasher, UserRepository } from '../../../src/modules/identity/domain/ports.js';
import type { Role, User } from '../../../src/modules/identity/domain/user.js';
import { DomainError } from '../../../src/shared/domain/errors.js';

/** Hasher reversível e instantâneo: os testes unitários não precisam do custo do bcrypt. */
export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async (plain, hash) => hash === `hashed:${plain}`,
};

export function inMemoryUsers(seed: Array<{ email: string; password: string; role: Role }> = []) {
  const users: User[] = seed.map((u, i) => ({
    id: `user-${i + 1}`,
    email: u.email,
    role: u.role,
    passwordHash: `hashed:${u.password}`,
  }));

  const repo: UserRepository = {
    findByEmail: async (email) => users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    create: async ({ email, passwordHash, role }) => {
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new DomainError('conflict', 'email-taken', 'Já existe um usuário com esse e-mail.');
      }
      const user = { id: `user-${users.length + 1}`, email, passwordHash, role };
      users.push(user);
      return user;
    },
  };
  return { repo, users };
}
