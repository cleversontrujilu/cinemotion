import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { runner } from 'node-pg-migrate';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../migrations', import.meta.url));

export interface TestDatabase {
  /** Conexão como dono do schema (o mesmo usuário que aplicou as migrations). */
  ownerUrl: string;
  migrate(direction: 'up' | 'down'): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Banco descartável com as migrations aplicadas.
 *
 * - Padrão: PostgreSQL 18 via Testcontainers (exige Docker).
 * - Com TEST_DATABASE_URL (superusuário de um PostgreSQL 18 já rodando, ex.:
 *   postgres://postgres:postgres@localhost:5432/postgres): cria um banco temporário
 *   nesse servidor e o remove no fim. Útil quando as portas do Docker não são
 *   acessíveis (WSL com userland-proxy desligado).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const { ownerUrl, teardown } = process.env.TEST_DATABASE_URL
    ? await temporaryDatabaseOn(process.env.TEST_DATABASE_URL)
    : await container();

  const migrate = async (direction: 'up' | 'down') => {
    await runner({
      databaseUrl: ownerUrl,
      dir: MIGRATIONS_DIR,
      migrationsTable: 'pgmigrations',
      direction,
      count: Infinity, // up aplica todas; down desfaz todas
      log: () => {},
    });
  };

  await migrate('up');
  return { ownerUrl, migrate, stop: teardown };
}

async function container() {
  const started = await new PostgreSqlContainer('postgres:18').start();
  return { ownerUrl: started.getConnectionUri(), teardown: async () => void (await started.stop()) };
}

async function temporaryDatabaseOn(maintenanceUrl: string) {
  const name = `cinemotion_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: maintenanceUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await ensureAppRoles(admin);
  await admin.end();

  const url = new URL(maintenanceUrl);
  url.pathname = `/${name}`;

  return {
    ownerUrl: url.toString(),
    teardown: async () => {
      const client = new pg.Client({ connectionString: maintenanceUrl });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}

/**
 * Os roles da aplicação são do servidor, não do banco. Com TEST_DATABASE_URL, os arquivos
 * de teste rodam em paralelo no mesmo servidor, e duas migrations 0001 simultâneas podiam
 * ver o role ausente e tentar criá-lo ao mesmo tempo (duplicate key em pg_authid). Aqui
 * eles são criados um de cada vez, sob um advisory lock no banco de manutenção, que é o
 * mesmo para todos os arquivos; a migration encontra os roles e pula o CREATE ROLE.
 */
async function ensureAppRoles(maintenance: pg.Client) {
  await maintenance.query(`
    DO $$
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('cinemotion_test_roles'));
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinemotion_admin') THEN
        CREATE ROLE cinemotion_admin LOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinemotion_customer') THEN
        CREATE ROLE cinemotion_customer LOGIN;
      END IF;
    END $$`);
}

export function poolFor(url: string): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 5 });
}

/** Executa `work` numa conexão do dono com SET ROLE, sem precisar da senha do role. */
export async function asRole<T>(
  pool: pg.Pool,
  role: 'cinemotion_customer' | 'cinemotion_admin',
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await work(client);
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    client.release();
  }
}

/**
 * Pool do dono que já conecta assumindo o role da aplicação (`-c role=...`, o mesmo
 * que SET ROLE), para testar com as permissões reais sem precisar da senha do role.
 */
export function rolePool(
  ownerUrl: string,
  role: 'cinemotion_customer' | 'cinemotion_admin',
  max = 5,
): pg.Pool {
  return new pg.Pool({ connectionString: ownerUrl, max, options: `-c role=${role}` });
}
