import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import type { Clock } from '../../../shared/domain/clock.js';
import { systemClock } from '../../../shared/domain/clock.js';
import { DomainError } from '../../../shared/domain/errors.js';
import type { AuthenticatedUser, TokenIssuer, TokenVerifier } from '../domain/ports.js';
import { ROLES, type Role } from '../domain/user.js';

export const ISSUER = 'cinemotion';

/** Audiência de cada API: um token de uma nunca é aceito pela outra. */
export const AUDIENCE: Record<Role, string> = {
  customer: 'cinemotion-customer',
  admin: 'cinemotion-admin',
};

export interface JwtConfig {
  secret: string;
  /** Validade do token em segundos. */
  ttlSeconds: number;
}

const ALGORITHM = 'HS256';

const unauthorized = (message: string) => new DomainError('unauthorized', 'invalid-token', message);

/**
 * Emite e valida tokens de UM papel. Cada API instancia o seu, com o seu segredo
 * e a sua audiência.
 */
export function jwtTokenService(
  role: Role,
  config: JwtConfig,
  clock: Clock = systemClock,
): TokenIssuer & TokenVerifier {
  const key = new TextEncoder().encode(config.secret);
  const audience = AUDIENCE[role];

  return {
    async issue(user) {
      const now = Math.floor(clock.now().getTime() / 1000);
      const accessToken = await new SignJWT({ email: user.email, role: user.role })
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setAudience(audience)
        .setIssuedAt(now)
        .setExpirationTime(now + config.ttlSeconds)
        .sign(key);
      return { accessToken, tokenType: 'Bearer', expiresIn: config.ttlSeconds };
    },

    async verify(token): Promise<AuthenticatedUser> {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience,
          currentDate: clock.now(),
          requiredClaims: ['sub', 'exp'],
        });
        const claimedRole = payload.role;
        if (
          typeof payload.sub !== 'string' ||
          typeof payload.email !== 'string' ||
          !ROLES.includes(claimedRole as Role) ||
          claimedRole !== role
        ) {
          throw unauthorized('Token inválido.');
        }
        return { id: payload.sub, email: payload.email, role: claimedRole as Role };
      } catch (err) {
        if (err instanceof DomainError) throw err;
        if (err instanceof joseErrors.JWTExpired) throw unauthorized('Token expirado.');
        throw unauthorized('Token inválido.');
      }
    },
  };
}
