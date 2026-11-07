import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCustomerApp } from '../../src/apps/customer.js';
import { poolFor, rolePool, startTestDatabase, type TestDatabase } from './support/database.js';

const authConfig = { secret: 'segredo-de-teste-com-pelo-menos-32-caracteres', ttlSeconds: 3600 };
const CONCURRENT_CLIENTS = 10;

describe('reservas', () => {
  let db: TestDatabase;
  let owner: pg.Pool;
  let customerPool: pg.Pool;
  let app: Express;

  /** Tokens de clientes distintos: tokens[0] é a "Ana", tokens[1] o "Bruno". */
  let tokens: string[] = [];
  const bearer = (i: number) => ({ authorization: `Bearer ${tokens[i]}` });

  let tomorrow: string; // Sessão daqui a 1 dia (pode cancelar)
  let inOneHour: string; // Sessão daqui a 1h (reserva sim, cancelamento não)
  let started: string; // Sessão que começou há 10 min (Sala 2)
  let seat: Record<string, string>; // rótulo → id, Sala 1
  let otherTheaterSeat: string;

  const reserve = (who: number, sessionId: string, labels: string[]) =>
    request(app)
      .post('/api/reservations')
      .set(bearer(who))
      .send({ sessionId, seatIds: labels.map((l) => seat[l]) });

  const occupancy = async (sessionId: string) => {
    const res = await request(app).get(`/api/sessions/${sessionId}/seats`);
    return Object.fromEntries(res.body.seats.map((s: { label: string; state: string }) => [s.label, s.state]));
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = poolFor(db.ownerUrl);
    customerPool = rolePool(db.ownerUrl, 'cinemotion_customer', CONCURRENT_CLIENTS + 2);
    app = createCustomerApp({ pool: customerPool, auth: authConfig });

    const { rows } = await owner.query<{ tomorrow: string; in_one_hour: string; started: string }>(`
      WITH t AS (INSERT INTO theater (name) VALUES ('Sala 1'), ('Sala 2') RETURNING id, name),
           seats AS (
             INSERT INTO seat (theater_id, seat_row, number, is_available)
             SELECT t.id, r, n, NOT (t.name = 'Sala 1' AND r = 'B' AND n = 5)
             FROM t, unnest(ARRAY['A', 'B']) r, generate_series(1, 5) n
           ),
           m AS (INSERT INTO movie (title, duration) VALUES ('Filme', 100) RETURNING id),
           s AS (
             INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
             SELECT m.id, t.id, x.starts_at, x.starts_at + interval '115 minutes', 25.50
             FROM m
             CROSS JOIN (VALUES ('Sala 1', now() + interval '1 day'),
                                ('Sala 1', now() + interval '1 hour'),
                                -- na Sala 2 para não se sobrepor à de daqui a 1h
                                ('Sala 2', now() - interval '10 minutes')) AS x(theater, starts_at)
             JOIN t ON t.name = x.theater
             RETURNING id, starts_at
           )
      SELECT (SELECT id FROM s ORDER BY starts_at DESC LIMIT 1) AS tomorrow,
             (SELECT id FROM s ORDER BY starts_at DESC OFFSET 1 LIMIT 1) AS in_one_hour,
             (SELECT id FROM s ORDER BY starts_at LIMIT 1) AS started
    `);
    ({ tomorrow, in_one_hour: inOneHour, started } = rows[0]!);

    const seats = await owner.query<{ id: string; label: string; theater: string }>(
      `SELECT s.id, s.seat_row || s.number AS label, t.name AS theater
       FROM seat s JOIN theater t ON t.id = s.theater_id`,
    );
    seat = Object.fromEntries(seats.rows.filter((s) => s.theater === 'Sala 1').map((s) => [s.label, s.id]));
    otherTheaterSeat = seats.rows.find((s) => s.theater === 'Sala 2')!.id;

    const hash = await bcrypt.hash('Senha@123', 4);
    const emails = Array.from({ length: CONCURRENT_CLIENTS }, (_, i) => `cliente${i}@email.com`);
    await owner.query(
      `INSERT INTO app_user (email, password_hash) SELECT unnest($1::text[]), $2`,
      [emails, hash],
    );
    tokens = await Promise.all(
      emails.map(async (email) => {
        const res = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
        return res.body.accessToken as string;
      }),
    );
  });

  afterAll(async () => {
    await customerPool?.end();
    await owner?.end();
    await db?.stop();
  });

  describe('mapa de ocupação', () => {
    it('é público e mostra livres e indisponíveis', async () => {
      const res = await request(app).get(`/api/sessions/${tomorrow}/seats`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ available: 9, reserved: 0, sold: 0, unavailable: 1 });
      expect(res.body.seats[0]).toMatchObject({ label: 'A1', row: 'A', number: 1, state: 'available' });
      expect((await occupancy(tomorrow)).B5).toBe('unavailable');
    });

    it('sessão inexistente dá 404', async () => {
      const res = await request(app).get('/api/sessions/0190f0e0-0000-7000-8000-000000000000/seats');
      expect(res.status).toBe(404);
    });
  });

  describe('criar reserva', () => {
    let anaReservation: string;

    it('exige token de cliente', async () => {
      const res = await request(app).post('/api/reservations').send({ sessionId: tomorrow, seatIds: [seat.A1] });
      expect(res.status).toBe(401);
    });

    it('reserva vários assentos numa operação, pendente por 10 minutos', async () => {
      const res = await reserve(0, tomorrow, ['A1', 'A2']);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'pending',
        seats: [{ label: 'A1' }, { label: 'A2' }],
        total: 51,
        session: { id: tomorrow, price: 25.5, movieTitle: 'Filme', theaterName: 'Sala 1' },
      });
      expect(res.body).not.toHaveProperty('ownerId');
      const holdMs = Date.parse(res.body.expiresAt) - Date.parse(res.body.createdAt);
      expect(holdMs).toBe(10 * 60_000);
      anaReservation = res.body.id;

      const map = await occupancy(tomorrow);
      expect([map.A1, map.A2, map.A3]).toEqual(['reserved', 'reserved', 'available']);
    });

    it('é atômica: se um assento está ocupado, nenhum é reservado', async () => {
      const res = await reserve(1, tomorrow, ['A3', 'A1']);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        type: '/problems/seat-already-taken',
        conflictingSeats: [{ id: seat.A1, label: 'A1' }],
      });
      expect((await occupancy(tomorrow)).A3).toBe('available');
    });

    it('lista todos os assentos em conflito, não só o primeiro', async () => {
      const res = await reserve(1, tomorrow, ['A2', 'A4', 'A1']);
      expect(res.body.conflictingSeats.map((s: { label: string }) => s.label)).toEqual(['A1', 'A2']);
    });

    it('recusa assento em manutenção', async () => {
      const res = await reserve(1, tomorrow, ['B5']);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ type: '/problems/seat-under-maintenance', seats: [{ label: 'B5' }] });
    });

    it('recusa assento de outra sala', async () => {
      const res = await request(app)
        .post('/api/reservations')
        .set(bearer(1))
        .send({ sessionId: tomorrow, seatIds: [otherTheaterSeat] });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ type: '/problems/seats-not-in-session', invalidSeats: [otherTheaterSeat] });
    });

    it('recusa mais de 6 assentos e assentos repetidos', async () => {
      const seven = await reserve(1, tomorrow, ['A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4']);
      expect(seven.status).toBe(400);
      const repeated = await reserve(1, tomorrow, ['A3', 'A3']);
      expect(repeated.status).toBe(400);
    });

    it('recusa sessão que já começou', async () => {
      const res = await reserve(1, started, ['A1']);
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('/problems/session-already-started');
    });

    it('reserva de outro cliente não aparece (404)', async () => {
      for (const res of [
        await request(app).get(`/api/reservations/${anaReservation}`).set(bearer(1)),
        await request(app).post(`/api/reservations/${anaReservation}/confirm`).set(bearer(1)),
        await request(app).post(`/api/reservations/${anaReservation}/cancel`).set(bearer(1)),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.type).toBe('/problems/reservation-not-found');
      }
    });

    it('confirmar transforma em Venda, e confirmar de novo é idempotente', async () => {
      const first = await request(app).post(`/api/reservations/${anaReservation}/confirm`).set(bearer(0));
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ status: 'confirmed', confirmedAt: expect.any(String) });

      const again = await request(app).post(`/api/reservations/${anaReservation}/confirm`).set(bearer(0));
      expect(again.status).toBe(200);
      expect(again.body.confirmedAt).toBe(first.body.confirmedAt);
      expect((await occupancy(tomorrow)).A1).toBe('sold');
    });

    it('lista as reservas do próprio cliente', async () => {
      const res = await request(app).get('/api/reservations').set(bearer(0));
      expect(res.body.map((r: { id: string }) => r.id)).toContain(anaReservation);
      expect((await request(app).get('/api/reservations').set(bearer(1))).body).toEqual([]);
    });
  });

  describe('expiração preguiçosa (ADR 0001)', () => {
    let overdue: string;

    beforeAll(async () => {
      overdue = (await reserve(0, tomorrow, ['A4'])).body.id;
      await owner.query(
        `UPDATE reservation SET created_at = now() - interval '15 minutes', expires_at = now() - interval '5 minutes'
         WHERE id = $1`,
        [overdue],
      );
    });

    it('reserva vencida aparece como expirada e o assento como livre, sem job', async () => {
      const res = await request(app).get(`/api/reservations/${overdue}`).set(bearer(0));
      expect(res.body.status).toBe('expired');
      expect((await occupancy(tomorrow)).A4).toBe('available');
    });

    it('não pode mais ser confirmada', async () => {
      const res = await request(app).post(`/api/reservations/${overdue}/confirm`).set(bearer(0));
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('/problems/reservation-expired');
    });

    it('outro cliente reserva o assento, e a vencida é gravada como expirada', async () => {
      const res = await reserve(1, tomorrow, ['A4']);
      expect(res.status).toBe(201);

      const stored = await owner.query(
        `SELECT r.status, rs.released_at IS NOT NULL AS released
         FROM reservation r JOIN reservation_seat rs ON rs.reservation_id = r.id WHERE r.id = $1`,
        [overdue],
      );
      expect(stored.rows[0]).toEqual({ status: 'expired', released: true });
    });
  });

  describe('cancelamento', () => {
    it('cancela e libera os assentos; cancelar de novo é idempotente', async () => {
      const id = (await reserve(2, tomorrow, ['A5'])).body.id;

      const res = await request(app).post(`/api/reservations/${id}/cancel`).set(bearer(2));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'cancelled', cancelledAt: expect.any(String) });
      expect((await occupancy(tomorrow)).A5).toBe('available');

      expect((await request(app).post(`/api/reservations/${id}/cancel`).set(bearer(2))).status).toBe(200);
      const confirm = await request(app).post(`/api/reservations/${id}/confirm`).set(bearer(2));
      expect(confirm.status).toBe(409);
      expect(confirm.body.type).toBe('/problems/reservation-cancelled');
    });

    it('a menos de 2h do início não pode cancelar', async () => {
      const created = await reserve(2, inOneHour, ['A1']);
      expect(created.status).toBe(201);

      const res = await request(app).post(`/api/reservations/${created.body.id}/cancel`).set(bearer(2));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ type: '/problems/cancellation-deadline-passed', deadline: expect.any(String) });
    });
  });

  describe('concorrência', () => {
    const activeHolds = async (labels: string[]) => {
      const { rows } = await owner.query<{ label: string; count: string }>(
        `SELECT s.seat_row || s.number AS label, count(*) AS count
         FROM reservation_seat rs JOIN seat s ON s.id = rs.seat_id
         WHERE rs.session_id = $1 AND rs.released_at IS NULL AND s.seat_row || s.number = ANY($2)
         GROUP BY 1`,
        [tomorrow, labels],
      );
      return Object.fromEntries(rows.map((r) => [r.label, Number(r.count)]));
    };

    it(`${CONCURRENT_CLIENTS} clientes pedindo o mesmo assento ao mesmo tempo: exatamente 1 consegue`, async () => {
      const responses = await Promise.all(
        tokens.map((_, i) => reserve(i, tomorrow, ['B1'])),
      );

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(CONCURRENT_CLIENTS - 1);
      for (const loser of responses.filter((r) => r.status === 409)) {
        expect(loser.body).toMatchObject({
          type: '/problems/seat-already-taken',
          conflictingSeats: [{ label: 'B1' }],
        });
      }
      expect(await activeHolds(['B1'])).toEqual({ B1: 1 });
    });

    it('pedidos simultâneos com assentos sobrepostos: só um leva, e os perdedores não deixam retenção parcial', async () => {
      // Metade pede B2+B3, metade B3+B4: todos disputam o B3.
      const responses = await Promise.all(
        tokens.map((_, i) => reserve(i, tomorrow, i % 2 === 0 ? ['B2', 'B3'] : ['B3', 'B4'])),
      );

      const winners = responses.filter((r) => r.status === 201);
      expect(winners).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(CONCURRENT_CLIENTS - 1);

      const won = winners[0]!.body.seats.map((s: { label: string }) => s.label);
      const expected = Object.fromEntries(won.map((label: string) => [label, 1]));
      expect(await activeHolds(['B2', 'B3', 'B4'])).toEqual(expected);
    });
  });
});
