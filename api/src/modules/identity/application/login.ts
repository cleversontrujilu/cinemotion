import { DomainError } from '../../../shared/domain/errors.js';
import type { IssuedToken, PasswordHasher, TokenIssuer, UserRepository } from '../domain/ports.js';
import { normalizeEmail, toPublicUser, type Role } from '../domain/user.js';

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Hash bcrypt de uma senha descartável. Quando o e-mail não existe, a senha é
 * comparada com ele mesmo assim, para que o tempo de resposta não revele quais
 * e-mails estão cadastrados.
 */
const DUMMY_HASH = '$2b$10$RlmS.5Oq30mekAslv./Gn.LBkV3jstOJCql0N8lqbvzAiiNjrCCoe';

const invalidCredentials = () =>
  new DomainError('unauthorized', 'invalid-credentials', 'E-mail ou senha inválidos.');

/**
 * Login de um papel específico: cada API só emite token para o seu papel.
 * Usuário de outro papel recebe o mesmo erro de credencial inválida.
 */
export function login(deps: {
  role: Role;
  users: UserRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
}) {
  return async (input: LoginInput): Promise<IssuedToken> => {
    const user = await deps.users.findByEmail(normalizeEmail(input.email));
    const passwordOk = await deps.hasher.verify(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk || user.role !== deps.role) throw invalidCredentials();

    return deps.tokens.issue(toPublicUser(user));
  };
}
