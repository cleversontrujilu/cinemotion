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
