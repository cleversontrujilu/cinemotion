import { describe, expect, it } from 'vitest';
import {
  assertSessionAcceptsReservations,
  assertValidSeatSelection,
  cancellationDeadline,
  decideCancellation,
  decideConfirmation,
  effectiveStatus,
  holdExpiresAt,
  type ReservationState,
} from '../../../src/modules/booking/domain/reservation.js';

const at = (iso: string) => new Date(iso);
const pending = (expiresAt: string): ReservationState => ({ status: 'pending', expiresAt: at(expiresAt) });

describe('prazo de 10 minutos', () => {
  it('a retenção vence 10 minutos depois de criada', () => {
    expect(holdExpiresAt(at('2030-01-01T12:00:00Z')).toISOString()).toBe('2030-01-01T12:10:00.000Z');
  });

  it('pendente com prazo vencido é expirada, mesmo gravada como pending (ADR 0001)', () => {
    expect(effectiveStatus(pending('2030-01-01T12:10:00Z'), at('2030-01-01T12:09:59Z'))).toBe('pending');
    expect(effectiveStatus(pending('2030-01-01T12:10:00Z'), at('2030-01-01T12:10:00Z'))).toBe('expired');
  });

  it('o prazo não afeta Vendas nem canceladas', () => {
    const late = at('2031-01-01T00:00:00Z');
    expect(effectiveStatus({ status: 'confirmed', expiresAt: at('2030-01-01T12:10:00Z') }, late)).toBe('confirmed');
    expect(effectiveStatus({ status: 'cancelled', expiresAt: at('2030-01-01T12:10:00Z') }, late)).toBe('cancelled');
  });
});

describe('sessão iniciada', () => {
  const startsAt = at('2030-01-01T19:00:00Z');

  it('aceita reserva até um instante antes do início', () => {
    expect(() => assertSessionAcceptsReservations(startsAt, at('2030-01-01T18:59:59Z'))).not.toThrow();
  });

  it.each(['2030-01-01T19:00:00Z', '2030-01-01T19:30:00Z'])('recusa reserva em %s (já começou)', (now) => {
    expect(() => assertSessionAcceptsReservations(startsAt, at(now))).toThrowError(
      expect.objectContaining({ code: 'session-already-started' }),
    );
  });
});

describe('seleção de assentos', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `seat-${i}`);

  it.each([1, 6])('aceita %i assento(s)', (n) => {
    expect(() => assertValidSeatSelection(ids(n))).not.toThrow();
  });

  it.each([0, 7])('recusa %i assentos', (n) => {
    expect(() => assertValidSeatSelection(ids(n))).toThrowError(
      expect.objectContaining({ code: 'invalid-seat-count' }),
    );
  });

  it('recusa assento repetido', () => {
    expect(() => assertValidSeatSelection(['a', 'b', 'a'])).toThrowError(
      expect.objectContaining({ code: 'duplicated-seats' }),
    );
  });
});

describe('confirmação', () => {
  const now = at('2030-01-01T12:05:00Z');

  it('confirma pendente no prazo', () => {
    expect(decideConfirmation(pending('2030-01-01T12:10:00Z'), now)).toBe('confirm');
  });

  it('é idempotente para Venda', () => {
    expect(decideConfirmation({ status: 'confirmed', expiresAt: at('2030-01-01T12:00:00Z') }, now)).toBe(
      'already-confirmed',
    );
  });

  it('recusa reserva expirada', () => {
    expect(() => decideConfirmation(pending('2030-01-01T12:04:00Z'), now)).toThrowError(
      expect.objectContaining({ code: 'reservation-expired' }),
    );
  });

  it('recusa reserva cancelada', () => {
    expect(() =>
      decideConfirmation({ status: 'cancelled', expiresAt: at('2030-01-01T12:10:00Z') }, now),
    ).toThrowError(expect.objectContaining({ code: 'reservation-cancelled' }));
  });
});

describe('cancelamento até 2h antes', () => {
  const startsAt = at('2030-01-01T19:00:00Z');
  const sold: ReservationState = { status: 'confirmed', expiresAt: at('2030-01-01T10:10:00Z') };

  it('o prazo é o início menos 2 horas', () => {
    expect(cancellationDeadline(startsAt).toISOString()).toBe('2030-01-01T17:00:00.000Z');
  });

  it('permite cancelar exatamente no limite (inclusive)', () => {
    expect(decideCancellation(sold, startsAt, at('2030-01-01T17:00:00Z'))).toBe('cancel');
  });

  it('recusa depois do limite, informando o prazo', () => {
    expect(() => decideCancellation(sold, startsAt, at('2030-01-01T17:00:01Z'))).toThrowError(
      expect.objectContaining({
        code: 'cancellation-deadline-passed',
        details: { deadline: '2030-01-01T17:00:00.000Z' },
      }),
    );
  });

  it('pendente no prazo também pode ser cancelada', () => {
    expect(decideCancellation(pending('2030-01-01T12:10:00Z'), startsAt, at('2030-01-01T12:01:00Z'))).toBe(
      'cancel',
    );
  });

  it('é idempotente para cancelada e recusa expirada', () => {
    const now = at('2030-01-01T12:30:00Z');
    expect(decideCancellation({ status: 'cancelled', expiresAt: at('2030-01-01T12:10:00Z') }, startsAt, now)).toBe(
      'already-cancelled',
    );
    expect(() => decideCancellation(pending('2030-01-01T12:10:00Z'), startsAt, now)).toThrowError(
      expect.objectContaining({ code: 'reservation-expired' }),
    );
  });
});
