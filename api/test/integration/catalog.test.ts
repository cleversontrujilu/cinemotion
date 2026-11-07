import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminApp } from '../../src/apps/admin.js';
import { createCustomerApp } from '../../src/apps/customer.js';
import { poolFor, rolePool, startTestDatabase, type TestDatabase } from './support/database.js';

const authConfig = { secret: 'segredo-de-teste-com-pelo-menos-32-caracteres', ttlSeconds: 3600 };

describe('catálogo: Salas, Filmes e Sessões', () => {
  let db: TestDatabase;
  let owner: pg.Pool;
  let pools: pg.Pool[];
  let admin: Express;
  let customer: Express;
  let token: string;

  const asAdmin = () => ({ authorization: `Bearer ${token}` });
  const post = (path: string, body: object) => request(admin).post(path).set(asAdmin()).send(body);
  const patch = (path: string, body: object) => request(admin).patch(path).set(asAdmin()).send(body);
  const del = (path: string) => request(admin).delete(path).set(asAdmin());

  let theaterId: string;
  let movieId: string;
  let sessionId: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = poolFor(db.ownerUrl);
    await owner.query(`INSERT INTO app_user (email, password_hash, role) VALUES ($1, $2, 'admin')`, [
      'admin@cinemotion.dev',
      await bcrypt.hash('Senha@123', 4),
    ]);
    const adminPool = rolePool(db.ownerUrl, 'cinemotion_admin');
    const customerPool = rolePool(db.ownerUrl, 'cinemotion_customer');
    pools = [owner, adminPool, customerPool];
    admin = createAdminApp({ pool: adminPool, auth: authConfig });
    customer = createCustomerApp({ pool: customerPool, auth: authConfig });

    const login = await request(admin)
      .post('/auth/login')
      .send({ email: 'admin@cinemotion.dev', password: 'Senha@123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await Promise.all(pools?.map((p) => p.end()) ?? []);
    await db?.stop();
  });

  describe('Salas', () => {
    it('escrita exige token de admin', async () => {
      const res = await request(admin).post('/theaters').send({ name: 'X', rows: 1, seatsPerRow: 1 });
      expect(res.status).toBe(401);
    });

    it('cria a sala com o mapa A1–J12 e as marcações', async () => {
      const res = await post('/theaters', {
        name: 'Sala 1',
        rows: 10,
        seatsPerRow: 12,
        accessibleSeats: ['A1', 'a2'],
        maintenanceSeats: ['B3'],
      });

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/theaters/${res.body.id}`);
      expect(res.body.seats).toHaveLength(120);
      expect(res.body.seats.at(-1).label).toBe('J12');
      const byLabel = Object.fromEntries(res.body.seats.map((s: { label: string }) => [s.label, s]));
      expect(byLabel.A1).toMatchObject({ accessible: true, underMaintenance: false });
      expect(byLabel.A2).toMatchObject({ accessible: true });
      expect(byLabel.B3).toMatchObject({ accessible: false, underMaintenance: true });
      theaterId = res.body.id;
    });

    it('recusa marcação de assento fora do mapa', async () => {
      const res = await post('/theaters', { name: 'Sala 2', rows: 2, seatsPerRow: 2, accessibleSeats: ['C1'] });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ type: '/problems/unknown-seats', unknownSeats: ['C1'] });
    });

    it('nome repetido dá 409 theater-name-taken', async () => {
      const res = await post('/theaters', { name: 'Sala 1', rows: 1, seatsPerRow: 1 });
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('/problems/theater-name-taken');
    });

    it('altera só as marcações, sem tocar no mapa', async () => {
      const res = await patch(`/theaters/${theaterId}/seats`, {
        seats: [
          { seat: 'B3', underMaintenance: false },
          { seat: 'J12', accessible: true },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.seats).toHaveLength(120);
      const byLabel = Object.fromEntries(res.body.seats.map((s: { label: string }) => [s.label, s]));
      expect(byLabel.B3).toMatchObject({ underMaintenance: false, accessible: false });
      expect(byLabel.J12).toMatchObject({ accessible: true, underMaintenance: false });
    });

    it('marcação com assento inexistente não altera nada', async () => {
      const res = await patch(`/theaters/${theaterId}/seats`, {
        seats: [
          { seat: 'A5', underMaintenance: true },
          { seat: 'Z99', underMaintenance: true },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.unknownSeats).toEqual(['Z99']);
      const theater = await request(admin).get(`/theaters/${theaterId}`).set(asAdmin());
      expect(theater.body.seats.find((s: { label: string }) => s.label === 'A5').underMaintenance).toBe(false);
    });

    it('sala inexistente dá 404', async () => {
      const res = await request(admin).get('/theaters/0190f0e0-0000-7000-8000-000000000000').set(asAdmin());
      expect(res.status).toBe(404);
      expect(res.body.type).toBe('/problems/theater-not-found');
    });
  });

  describe('Filmes e Sessões', () => {
    it('cria filme', async () => {
      const res = await post('/movies', { title: 'Filme de 2h', duration: 120 });
      expect(res.status).toBe(201);
      movieId = res.body.id;
    });

    it('cria sessão com fim = início + duração + 15 min', async () => {
      const res = await post('/sessions', {
        movieId,
        theaterId,
        startsAt: '2030-01-01T19:00:00-03:00',
        price: 34.5,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        startsAt: '2030-01-01T22:00:00.000Z',
        endsAt: '2030-01-02T00:15:00.000Z',
        price: 34.5,
        movie: { id: movieId, title: 'Filme de 2h', duration: 120 },
        theater: { id: theaterId, name: 'Sala 1' },
      });
      sessionId = res.body.id;
    });

    it('sessão que invade a limpeza da anterior dá 409 session-overlap', async () => {
      const res = await post('/sessions', { movieId, theaterId, startsAt: '2030-01-01T21:10:00-03:00', price: 30 });
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('/problems/session-overlap');
    });

    it('sessão começando no fim exato da limpeza é aceita', async () => {
      const res = await post('/sessions', { movieId, theaterId, startsAt: '2030-01-01T21:15:00-03:00', price: 30 });
      expect(res.status).toBe(201);
    });

    it('sessão no passado dá 400 session-starts-in-past', async () => {
      const res = await post('/sessions', { movieId, theaterId, startsAt: '2020-01-01T19:00:00-03:00', price: 30 });
      expect(res.status).toBe(400);
      expect(res.body.type).toBe('/problems/session-starts-in-past');
    });

    it('data sem fuso e preço com 3 casas são recusados', async () => {
      const res = await post('/sessions', { movieId, theaterId, startsAt: '2030-02-01T19:00:00', price: 10.555 });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['price', 'startsAt']);
    });

    it('filme inexistente dá 404 movie-not-found', async () => {
      const res = await post('/sessions', {
        movieId: '0190f0e0-0000-7000-8000-000000000000',
        theaterId,
        startsAt: '2030-03-01T19:00:00-03:00',
        price: 30,
      });
      expect(res.status).toBe(404);
      expect(res.body.type).toBe('/problems/movie-not-found');
    });

    it('mudar a duração do filme não altera o fim das sessões existentes', async () => {
      await patch(`/movies/${movieId}`, { duration: 90 });
      const res = await request(admin).get(`/sessions/${sessionId}`).set(asAdmin());
      expect(res.body.endsAt).toBe('2030-01-02T00:15:00.000Z');
    });

    it('reagendar recalcula o fim com a duração atual do filme', async () => {
      const res = await patch(`/sessions/${sessionId}`, { startsAt: '2030-01-01T18:00:00-03:00' });
      expect(res.status).toBe(200);
      expect(res.body.endsAt).toBe(new Date('2030-01-01T19:45:00-03:00').toISOString());
    });

    it('sessão com reserva ativa não pode ser editada nem excluída', async () => {
      await owner.query(`INSERT INTO app_user (email, password_hash) VALUES ('c@x.dev', 'h')`);
      await owner.query(
        `INSERT INTO reservation (session_id, app_user_id, expires_at)
         SELECT $1, id, now() + interval '10 minutes' FROM app_user WHERE email = 'c@x.dev'`,
        [sessionId],
      );

      const edit = await patch(`/sessions/${sessionId}`, { price: 40 });
      expect(edit.status).toBe(409);
      expect(edit.body).toMatchObject({ type: '/problems/session-has-active-reservations', activeReservations: 1 });
      expect((await del(`/sessions/${sessionId}`)).status).toBe(409);
    });

    it('reserva pendente vencida não bloqueia a edição', async () => {
      await owner.query(
        `UPDATE reservation SET created_at = now() - interval '20 minutes', expires_at = now() - interval '10 minutes'`,
      );
      const res = await patch(`/sessions/${sessionId}`, { price: 40 });
      expect(res.status).toBe(200);
      expect(res.body.price).toBe(40);
    });

    it('filme e sala com sessões não podem ser removidos (409 in-use)', async () => {
      const movie = await del(`/movies/${movieId}`);
      expect(movie.status).toBe(409);
      expect(movie.body.type).toBe('/problems/in-use');
      expect((await del(`/theaters/${theaterId}`)).body.type).toBe('/problems/in-use');
    });
  });

  describe('listagem pública na API do cliente', () => {
    let otherMovieId: string;

    beforeAll(async () => {
      otherMovieId = (await post('/movies', { title: 'Outro', duration: 60 })).body.id;
      // 23:30 em Brasília do dia 05 já é dia 06 em UTC: precisa contar como dia 05.
      await post('/sessions', { movieId: otherMovieId, theaterId, startsAt: '2030-01-05T23:30:00-03:00', price: 20 });
      await post('/sessions', { movieId: otherMovieId, theaterId, startsAt: '2030-01-06T14:00:00-03:00', price: 20 });
      // Sessão passada inserida direto no banco (a API não deixa criar).
      await owner.query(
        `INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
         VALUES ($1, $2, now() - interval '3 days', now() - interval '3 days' + interval '75 minutes', 20)`,
        [otherMovieId, theaterId],
      );
    });

    it('é pública e lista só sessões futuras, em ordem de início', async () => {
      const res = await request(customer).get('/sessions');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(4);
      const starts = res.body.items.map((s: { startsAt: string }) => s.startsAt);
      expect(starts).toEqual([...starts].sort());
    });

    it('filtra por filme', async () => {
      const res = await request(customer).get('/sessions').query({ movieId: otherMovieId });
      expect(res.body.total).toBe(2);
    });

    it('filtra pelo dia no fuso de Brasília', async () => {
      const day5 = await request(customer).get('/sessions').query({ date: '2030-01-05' });
      expect(day5.body.items.map((s: { startsAt: string }) => s.startsAt)).toEqual(['2030-01-06T02:30:00.000Z']);
      const day6 = await request(customer).get('/sessions').query({ date: '2030-01-06' });
      expect(day6.body.total).toBe(1);
    });

    it('pagina com total e totalPages', async () => {
      const page2 = await request(customer).get('/sessions').query({ page: 2, pageSize: 3 });
      expect(page2.body).toMatchObject({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
      expect(page2.body.items).toHaveLength(1);

      const beyond = await request(customer).get('/sessions').query({ page: 9, pageSize: 3 });
      expect(beyond.body).toMatchObject({ items: [], total: 4, totalPages: 2 });
    });

    it('valida os filtros', async () => {
      const res = await request(customer).get('/sessions').query({ date: '05/01/2030', pageSize: 500 });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['date', 'pageSize']);
    });

    it('admin pode incluir sessões passadas', async () => {
      const res = await request(admin).get('/sessions').set(asAdmin()).query({ includePast: 'true' });
      expect(res.body.total).toBe(5);
    });

    it('a API do cliente não tem escrita no catálogo', async () => {
      const res = await request(customer).post('/movies').send({ title: 'x', duration: 1 });
      expect(res.status).toBe(404);
    });
  });
});
