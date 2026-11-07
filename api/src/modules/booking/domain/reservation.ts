import { DomainError } from '../../../shared/domain/errors.js';

export const MAX_SEATS_PER_RESERVATION = 6;
export const HOLD_MINUTES = 10;
export const CANCELLATION_DEADLINE_HOURS = 2;

export type StoredStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

export interface ReservationState {
  status: StoredStatus;
  expiresAt: Date;
}

/**
 * Status real da Reserva. Pendente com prazo vencido é expirada, mesmo que o banco
 * ainda diga 'pending' (expiração preguiçosa, ADR 0001).
 */
export function effectiveStatus(reservation: ReservationState, now: Date): StoredStatus {
  return reservation.status === 'pending' && reservation.expiresAt.getTime() <= now.getTime()
    ? 'expired'
    : reservation.status;
}

export const holdExpiresAt = (now: Date): Date => new Date(now.getTime() + HOLD_MINUTES * 60_000);

/** Sessão iniciada (now >= início) não aceita novas Reservas. */
export function assertSessionAcceptsReservations(sessionStartsAt: Date, now: Date): void {
  if (now.getTime() >= sessionStartsAt.getTime()) {
    throw new DomainError('conflict', 'session-already-started', 'A sessão já começou e não aceita reservas.');
  }
}

/** De 1 a 6 Assentos, sem repetição. */
export function assertValidSeatSelection(seatIds: string[]): void {
  if (seatIds.length < 1 || seatIds.length > MAX_SEATS_PER_RESERVATION) {
    throw new DomainError(
      'validation',
      'invalid-seat-count',
      `Uma reserva tem de 1 a ${MAX_SEATS_PER_RESERVATION} assentos.`,
    );
  }
  if (new Set(seatIds).size !== seatIds.length) {
    throw new DomainError('validation', 'duplicated-seats', 'A reserva tem assentos repetidos.');
  }
}

export type ConfirmDecision = 'confirm' | 'already-confirmed';

/**
 * Confirmação (pagamento simulado): aceita enquanto a Reserva está no prazo, mesmo
 * com a Sessão já iniciada. Confirmar de novo é idempotente.
 */
export function decideConfirmation(reservation: ReservationState, now: Date): ConfirmDecision {
  switch (effectiveStatus(reservation, now)) {
    case 'pending':
      return 'confirm';
    case 'confirmed':
      return 'already-confirmed';
    case 'cancelled':
      throw new DomainError('conflict', 'reservation-cancelled', 'A reserva foi cancelada.');
    case 'expired':
      throw new DomainError('conflict', 'reservation-expired', 'O prazo de 10 minutos da reserva expirou.');
  }
}

export type CancelDecision = 'cancel' | 'already-cancelled';

/** Prazo final para cancelar: início da Sessão menos 2 horas, inclusive. */
export const cancellationDeadline = (sessionStartsAt: Date): Date =>
  new Date(sessionStartsAt.getTime() - CANCELLATION_DEADLINE_HOURS * 3_600_000);

/**
 * Cancelamento de Reserva pendente ou Venda, até 2h antes do início (inclusive).
 * Cancelar de novo é idempotente.
 */
export function decideCancellation(reservation: ReservationState, sessionStartsAt: Date, now: Date): CancelDecision {
  const status = effectiveStatus(reservation, now);
  if (status === 'cancelled') return 'already-cancelled';
  if (status === 'expired') {
    throw new DomainError('conflict', 'reservation-expired', 'O prazo de 10 minutos da reserva expirou.');
  }
  const deadline = cancellationDeadline(sessionStartsAt);
  if (now.getTime() > deadline.getTime()) {
    throw new DomainError(
      'conflict',
      'cancellation-deadline-passed',
      `Cancelamentos são permitidos até ${CANCELLATION_DEADLINE_HOURS} horas antes do início da sessão.`,
      { deadline: deadline.toISOString() },
    );
  }
  return 'cancel';
}
