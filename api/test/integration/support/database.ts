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
      count: direction === 'up' ? Infinity : 1,
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
export function rolePool(ownerUrl: string, role: 'cinemotion_customer' | 'cinemotion_admin'): pg.Pool {
  return new pg.Pool({ connectionString: ownerUrl, max: 5, options: `-c role=${role}` });
}
