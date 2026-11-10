import { DomainError } from '../../../shared/domain/errors.js';

/** Tempo de limpeza da Sala entre uma Sessão e a próxima. */
export const CLEANING_MINUTES = 15;

/**
 * Fim da Sessão = início + duração do Filme + limpeza. É fixado quando a Sessão é
 * criada (ou reagendada) e não acompanha mudanças posteriores na duração do Filme.
 */
export function computeEndsAt(startsAt: Date, movieDurationMinutes: number): Date {
  return new Date(startsAt.getTime() + (movieDurationMinutes + CLEANING_MINUTES) * 60_000);
}

/** Sessão futura: início estritamente depois de agora (now() do banco). */
export function assertStartsInFuture(startsAt: Date, now: Date): void {
  if (startsAt.getTime() <= now.getTime()) {
    throw new DomainError('validation', 'session-starts-in-past', 'A sessão precisa começar no futuro.');
  }
}

/** Sessão com Reserva ativa (pendente no prazo ou Venda) não pode ser editada nem excluída. */
export function assertNoActiveReservations(activeReservations: number): void {
  if (activeReservations > 0) {
    throw new DomainError(
      'conflict',
      'session-has-active-reservations',
      'A sessão tem reservas ativas e não pode ser alterada nem excluída.',
      { activeReservations },
    );
  }
}
