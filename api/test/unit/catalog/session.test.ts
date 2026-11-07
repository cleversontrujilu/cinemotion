import { describe, expect, it } from 'vitest';
import {
  assertNoActiveReservations,
  assertStartsInFuture,
  CLEANING_MINUTES,
  computeEndsAt,
} from '../../../src/modules/catalog/domain/session.js';

describe('computeEndsAt', () => {
  it('soma a duração do filme e 15 minutos de limpeza', () => {
    const endsAt = computeEndsAt(new Date('2030-01-01T19:00:00-03:00'), 120);
    expect(CLEANING_MINUTES).toBe(15);
    expect(endsAt.toISOString()).toBe(new Date('2030-01-01T21:15:00-03:00').toISOString());
  });
});

describe('assertStartsInFuture', () => {
  const now = new Date('2030-01-01T12:00:00Z');

  it('aceita início depois de agora', () => {
    expect(() => assertStartsInFuture(new Date('2030-01-01T12:00:01Z'), now)).not.toThrow();
  });

  it.each(['2030-01-01T12:00:00Z', '2030-01-01T11:59:59Z'])('recusa início em %s (não é futuro)', (at) => {
    expect(() => assertStartsInFuture(new Date(at), now)).toThrowError(
      expect.objectContaining({ code: 'session-starts-in-past' }),
    );
  });
});

describe('assertNoActiveReservations', () => {
  it('libera sessão sem reservas ativas', () => {
    expect(() => assertNoActiveReservations(0)).not.toThrow();
  });

  it('bloqueia sessão com reserva ativa (409)', () => {
    expect(() => assertNoActiveReservations(2)).toThrowError(
      expect.objectContaining({ kind: 'conflict', code: 'session-has-active-reservations' }),
    );
  });
});
