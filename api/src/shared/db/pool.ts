import pg from 'pg';
import type { DbConfig } from '../../config/env.js';

/**
 * Cria o pool. Na Lambda é criado fora do handler (reaproveitado entre invocações)
 * e com max: 1, para que o reserved concurrency limite as conexões no Postgres.
 */
export function createPool(config: DbConfig): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    // Fuso único da rede: o "dia da Sessão" e os filtros por data são calculados nele.
    options: `-c timezone=${config.timezone}`,
  });
  // Um cliente ocioso que cai não deve derrubar o processo.
  pool.on('error', (err) => console.error('[pg] erro em conexão ociosa', err));
  return pool;
}
