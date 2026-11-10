import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError } from '../../../src/shared/domain/errors.js';
import { errorHandler, notFoundHandler } from '../../../src/shared/http/problem-details.js';
import { parseInput } from '../../../src/shared/http/validation.js';

function appThrowing(error: unknown) {
  const app = express();
  app.use(express.json());
  app.post('/boom', () => {
    throw error;
  });
  app.post('/validate', (req, res) => {
    const body = parseInput(z.object({ seats: z.array(z.uuid()).min(1).max(6) }), req.body);
    res.json(body);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler (Problem Details, RFC 9457)', () => {
  it('converte DomainError no status da categoria, com extensões', async () => {
    const app = appThrowing(
      new DomainError('conflict', 'seat-already-taken', 'Assentos ocupados.', {
        conflictingSeats: ['A1'],
      }),
    );

    const res = await request(app).post('/boom');

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: '/problems/seat-already-taken',
      title: 'Conflito',
      status: 409,
      detail: 'Assentos ocupados.',
      instance: '/boom',
      conflictingSeats: ['A1'],
    });
  });

  it('traduz erro do Postgres sem vazar a mensagem original', async () => {
    const app = appThrowing({
      severity: 'ERROR',
      code: '23P01',
      constraint: 'session_no_overlap',
      message: 'conflicting key value violates exclusion constraint "session_no_overlap"',
    });

    const res = await request(app).post('/boom');

    expect(res.status).toBe(409);
    expect(res.body.type).toBe('/problems/session-overlap');
    expect(JSON.stringify(res.body)).not.toContain('exclusion constraint');
  });

  it('erro desconhecido vira 500 genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThrowing(new Error('segredo interno'))).post('/boom');
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.type).toBe('/problems/internal-error');
    expect(JSON.stringify(res.body)).not.toContain('segredo interno');
  });

  it('JSON malformado vira 400', async () => {
    const res = await request(appThrowing(null))
      .post('/validate')
      .set('content-type', 'application/json')
      .send('{"seats":');

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('/problems/malformed-json');
  });

  it('falha de validação lista os campos inválidos', async () => {
    const res = await request(appThrowing(null))
      .post('/validate')
      .send({ seats: ['nao-e-uuid'] });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('/problems/validation-error');
    expect(res.body.errors).toEqual([{ path: 'seats.0', message: expect.any(String) }]);
  });

  it('rota inexistente vira 404 em Problem Details', async () => {
    const res = await request(appThrowing(null)).get('/nada');

    expect(res.status).toBe(404);
    expect(res.body.type).toBe('/problems/route-not-found');
  });
});
