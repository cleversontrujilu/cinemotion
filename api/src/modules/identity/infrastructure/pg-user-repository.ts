import type { Pool } from 'pg';
import type { UserRepository } from '../domain/ports.js';
import type { Role, User } from '../domain/user.js';

interface UserRow {
  id: string;
  email: string;
  role: Role;
  password_hash: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  role: row.role,
  passwordHash: row.password_hash,
});

export function pgUserRepository(pool: Pool): UserRepository {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, role, password_hash FROM app_user WHERE lower(email) = lower($1)`,
        [email],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async create({ email, passwordHash, role }) {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO app_user (email, password_hash, role) VALUES ($1, $2, $3)
         RETURNING id, email, role, password_hash`,
        [email, passwordHash, role],
      );
      return toUser(rows[0]!);
    },
  };
}
