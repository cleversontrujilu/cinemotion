import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../domain/ports.js';

/** bcrypt puro em JS (sem binário nativo, roda igual na Lambda). Custo 10, como no seed. */
export function bcryptPasswordHasher(cost = 10): PasswordHasher {
  return {
    hash: (plain) => bcrypt.hash(plain, cost),
    verify: (plain, hash) => bcrypt.compare(plain, hash),
  };
}
