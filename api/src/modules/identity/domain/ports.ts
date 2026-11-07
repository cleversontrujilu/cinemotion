import type { PublicUser, Role, User } from './user.js';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  /** Cria o usuário. E-mail duplicado viola ux_app_user_email (traduzido para 409 email-taken). */
  create(data: { email: string; passwordHash: string; role: Role }): Promise<User>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface IssuedToken {
  accessToken: string;
  tokenType: 'Bearer';
  /** Segundos até expirar. */
  expiresIn: number;
}

export interface TokenIssuer {
  issue(user: PublicUser): Promise<IssuedToken>;
}

/** Usuário autenticado extraído de um token válido. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface TokenVerifier {
  /** Lança DomainError('unauthorized') se o token for inválido, expirado ou de outra audiência. */
  verify(token: string): Promise<AuthenticatedUser>;
}
