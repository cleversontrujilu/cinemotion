import { z } from 'zod';

const dbSchema = z.object({
  url: z.string().min(1),
  poolMax: z.coerce.number().int().min(1).default(1),
  timezone: z.string().min(1).default('America/Sao_Paulo'),
});

export type DbConfig = z.infer<typeof dbSchema>;

type Env = Record<string, string | undefined>;

/**
 * Lê a configuração do banco. Na Lambda cada função recebe só DATABASE_URL;
 * no servidor local cada app usa a URL do seu role (CUSTOMER_/ADMIN_DATABASE_URL).
 */
export function loadDbConfig(env: Env, urlVar = 'DATABASE_URL'): DbConfig {
  const result = dbSchema.safeParse({
    url: env[urlVar],
    poolMax: env.DB_POOL_MAX,
    timezone: env.APP_TIMEZONE,
  });
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuração de banco inválida (${urlVar}): ${fields}`);
  }
  return result.data;
}

const authSchema = z.object({
  secret: z.string().min(32, 'o segredo do JWT precisa de pelo menos 32 caracteres'),
  ttlSeconds: z.coerce.number().int().positive().default(3600),
});

export type AuthConfig = z.infer<typeof authSchema>;

/**
 * Configuração do JWT. Cada API tem seu próprio segredo: na Lambda, JWT_SECRET;
 * no servidor local, CUSTOMER_JWT_SECRET / ADMIN_JWT_SECRET.
 */
export function loadAuthConfig(env: Env, secretVar = 'JWT_SECRET'): AuthConfig {
  const result = authSchema.safeParse({ secret: env[secretVar], ttlSeconds: env.JWT_TTL_SECONDS });
  if (!result.success) {
    const fields = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Configuração de autenticação inválida (${secretVar}): ${fields}`);
  }
  return result.data;
}
