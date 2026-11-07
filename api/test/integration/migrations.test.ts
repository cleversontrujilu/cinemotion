import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/shared/domain/errors.js';
import { translatePgError, isPgError } from '../../src/shared/http/pg-error-translator.js';
import { asRole, poolFor, startTestDatabase, type TestDatabase } from './support/database.js';

/** Executa `sql` e devolve o erro de domínio traduzido (falha se não houver erro). */
async function translatedError(pool: pg.Pool, sql: string): Promise<DomainError | null> {
  try {
    await pool.query(sql);
  } catch (err) {
    if (!isPgError(err)) throw err;
    return translatePgError(err);
  }
  throw new Error(`a query deveria falhar: ${sql}`);
}

describe('migration 0001 contra PostgreSQL 18', () => {
  let db: TestDatabase;
  let owner: pg.Pool;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = poolFor(db.ownerUrl);

    await owner.query(`
      INSERT INTO theater (name) VALUES ('Sala 1');
      INSERT INTO movie (title, duration) VALUES ('Filme', 120);
      INSERT INTO seat (theater_id, seat_row, number) SELECT id, 'A', 1 FROM theater;
      INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
        SELECT m.id, t.id, '2030-01-01 14:00-03', '2030-01-01 16:15-03', 30 FROM movie m, theater t;
    `);
  });

  afterAll(async () => {
    await owner?.end();
    await db?.stop();
  });

  it('gera chaves uuidv7', async () => {
    const { rows } = await owner.query<{ version: number }>(
      `SELECT uuid_extract_version(id) AS version FROM theater LIMIT 1`,
    );
    expect(rows[0]?.version).toBe(7);
  });

  it('sessões sobrepostas na mesma sala viram session-overlap', async () => {
    const err = await translatedError(
      owner,
      `INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
       SELECT m.id, t.id, '2030-01-01 16:00-03', '2030-01-01 18:15-03', 30 FROM movie m, theater t`,
    );
    expect(err?.code).toBe('session-overlap');
  });

  it('sessão começando no fim exato da anterior é aceita (intervalo [início, fim))', async () => {
    await owner.query(
      `INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
       SELECT m.id, t.id, '2030-01-01 16:15-03', '2030-01-01 18:30-03', 30 FROM movie m, theater t`,
    );
  });

  it('o mesmo assento não fica em duas reservas ativas da sessão', async () => {
    await owner.query(`
      INSERT INTO app_user (email, password_hash) VALUES ('a@x.dev', 'h'), ('b@x.dev', 'h');
      INSERT INTO reservation (session_id, app_user_id, expires_at)
        SELECT s.id, u.id, now() + interval '10 minutes'
        FROM (SELECT id FROM session ORDER BY starts_at LIMIT 1) s, app_user u;
      INSERT INTO reservation_seat (reservation_id, session_id, seat_id)
        SELECT r.id, r.session_id, (SELECT id FROM seat)
        FROM reservation r JOIN app_user u ON u.id = r.app_user_id WHERE u.email = 'a@x.dev';
    `);

    const err = await translatedError(
      owner,
      `INSERT INTO reservation_seat (reservation_id, session_id, seat_id)
       SELECT r.id, r.session_id, (SELECT id FROM seat)
       FROM reservation r JOIN app_user u ON u.id = r.app_user_id WHERE u.email = 'b@x.dev'`,
    );
    expect(err?.code).toBe('seat-already-taken');
  });

  it('assento liberado pode ser reservado de novo', async () => {
    await owner.query(`UPDATE reservation_seat SET released_at = now()`);
    await owner.query(
      `INSERT INTO reservation_seat (reservation_id, session_id, seat_id)
       SELECT r.id, r.session_id, (SELECT id FROM seat)
       FROM reservation r JOIN app_user u ON u.id = r.app_user_id WHERE u.email = 'b@x.dev'`,
    );
  });

  it('e-mail é único sem diferenciar maiúsculas', async () => {
    const err = await translatedError(
      owner,
      `INSERT INTO app_user (email, password_hash) VALUES ('A@X.DEV', 'h')`,
    );
    expect(err?.code).toBe('email-taken');
  });

  it('remover filme com sessão vira in-use', async () => {
    const err = await translatedError(owner, `DELETE FROM movie`);
    expect(err?.code).toBe('in-use');
  });

  it('role do cliente lê o catálogo mas não escreve nele', async () => {
    await asRole(owner, 'cinemotion_customer', async (client) => {
      await expect(client.query(`SELECT count(*) FROM session`)).resolves.toBeTruthy();
      await expect(client.query(`DELETE FROM movie`)).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('role do admin não altera reservas', async () => {
    await asRole(owner, 'cinemotion_admin', async (client) => {
      await expect(client.query(`UPDATE reservation SET status = 'cancelled'`)).rejects.toMatchObject({
        code: '42501',
      });
    });
  });

  it('down remove o schema', async () => {
    await db.migrate('down');
    const { rows } = await owner.query<{ count: string }>(
      `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'pgmigrations'`,
    );
    expect(rows[0]?.count).toBe('0');
  });
});
