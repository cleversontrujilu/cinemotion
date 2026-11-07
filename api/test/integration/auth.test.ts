import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminApp } from '../../src/apps/admin.js';
import { createCustomerApp } from '../../src/apps/customer.js';
import { poolFor, rolePool, startTestDatabase, type TestDatabase } from './support/database.js';

const auth = (secret: string) => ({ secret: secret.padEnd(32, '-'), ttlSeconds: 3600 });

describe('autenticação nas duas APIs', () => {
  let db: TestDatabase;
  let pools: pg.Pool[];
  let customerApp: Express;
  let adminApp: Express;

  beforeAll(async () => {
    db = await startTestDatabase();
    const owner = poolFor(db.ownerUrl);
    await owner.query(`INSERT INTO app_user (email, password_hash, role) VALUES ($1, $2, 'admin')`, [
      'admin@cinemotion.dev',
      await bcrypt.hash('Senha@123', 4),
    ]);
    const customerPool = rolePool(db.ownerUrl, 'cinemotion_customer');
    const adminPool = rolePool(db.ownerUrl, 'cinemotion_admin');
    pools = [owner, customerPool, adminPool];

    customerApp = createCustomerApp({ pool: customerPool, auth: auth('customer') });
    adminApp = createAdminApp({ pool: adminPool, auth: auth('admin') });
  });

  afterAll(async () => {
    await Promise.all(pools?.map((p) => p.end()) ?? []);
    await db?.stop();
  });

  it('cliente se cadastra, faz login e consulta /auth/me', async () => {
    const created = await request(customerApp)
      .post('/auth/register')
      .send({ email: 'Ana@Email.com', password: 'Senha@123' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), email: 'ana@email.com', role: 'customer' });

    const logged = await request(customerApp)
      .post('/auth/login')
      .send({ email: 'ana@email.com', password: 'Senha@123' });
    expect(logged.status).toBe(200);
    expect(logged.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600 });

    const me = await request(customerApp)
      .get('/auth/me')
      .set('authorization', `Bearer ${logged.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(created.body);
  });

  it('e-mail repetido (qualquer caixa) dá 409 email-taken', async () => {
    const res = await request(customerApp)
      .post('/auth/register')
      .send({ email: 'ANA@email.com', password: 'Senha@123' });
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('/problems/email-taken');
  });

  it('cadastro valida a entrada', async () => {
    const res = await request(customerApp).post('/auth/register').send({ email: 'x', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['email', 'password']);
  });

  it('a API admin responde só sob /admin', async () => {
    expect((await request(adminApp).get('/admin/health')).status).toBe(200);
    expect((await request(adminApp).post('/auth/login').send({})).status).toBe(404);
  });

  it('a API admin não tem cadastro', async () => {
    const res = await request(adminApp)
      .post('/admin/auth/register')
      .send({ email: 'novo@admin.dev', password: 'Senha@123' });
    expect(res.status).toBe(404);
  });

  it('admin entra só na API admin', async () => {
    const credentials = { email: 'admin@cinemotion.dev', password: 'Senha@123' };
    expect((await request(adminApp).post('/admin/auth/login').send(credentials)).status).toBe(200);

    const onCustomer = await request(customerApp).post('/auth/login').send(credentials);
    expect(onCustomer.status).toBe(401);
    expect(onCustomer.body.type).toBe('/problems/invalid-credentials');
  });

  it('token da API cliente é recusado na API admin', async () => {
    const { body } = await request(customerApp)
      .post('/auth/login')
      .send({ email: 'ana@email.com', password: 'Senha@123' });

    const res = await request(adminApp).get('/admin/auth/me').set('authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body.type).toBe('/problems/invalid-token');
  });

  it('rota protegida sem token dá 401 missing-token', async () => {
    const res = await request(customerApp).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.type).toBe('/problems/missing-token');
  });
});

describe('rolePool', () => {
  it('conecta com o role da aplicação', async () => {
    const db = await startTestDatabase();
    const pool = rolePool(db.ownerUrl, 'cinemotion_customer');
    try {
      const { rows } = await pool.query<{ current_user: string }>('SELECT current_user');
      expect(rows[0]?.current_user).toBe('cinemotion_customer');
    } finally {
      await pool.end();
      await db.stop();
    }
  });
});
