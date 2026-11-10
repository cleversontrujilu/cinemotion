export const ROLES = ['customer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  role: Role;
  passwordHash: string;
}

/** Dados do usuário que podem sair da API (nunca o hash). */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
}

export const toPublicUser = ({ id, email, role }: User): PublicUser => ({ id, email, role });

/** E-mail é comparado sem diferenciar maiúsculas (índice único em lower(email)). */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** O bcrypt ignora o que passa de 72 bytes; senhas maiores são recusadas na entrada. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
