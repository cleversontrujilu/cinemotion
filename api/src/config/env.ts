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
