import type { Pool, PoolClient } from 'pg';

/**
 * Executa `work` numa transação: COMMIT se resolver, ROLLBACK se lançar.
 * O erro original é sempre repropagado.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Conexão em estado desconhecido: descarta em vez de devolver ao pool.
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    }
    throw err;
  } finally {
    client.release(broken);
  }
}

/** Qualquer coisa que execute SQL: o pool (fora de transação) ou um client (dentro). */
export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

/** now() do banco: toda regra de tempo usa o relógio do Postgres, nunca o da Lambda. */
export async function databaseNow(db: Queryable): Promise<Date> {
  const { rows } = await db.query<{ now: Date }>('SELECT now() AS now');
  return rows[0]!.now;
}
