import type { Pool } from 'pg';
import { databaseNow, withTransaction } from '../../../shared/db/transaction.js';
import { DomainError } from '../../../shared/domain/errors.js';
import { isPgError } from '../../../shared/http/pg-error-translator.js';
import type { OccupancyMap, Reservation } from '../domain/model.js';
import { seatState, type SeatState } from '../domain/occupancy.js';
import type { BookingRepositoryFactory } from '../domain/ports.js';
import {
  assertSessionAcceptsReservations,
  assertValidSeatSelection,
  decideCancellation,
  decideConfirmation,
  holdExpiresAt,
} from '../domain/reservation.js';

export interface BookingDeps {
  pool: Pool;
  repo: BookingRepositoryFactory;
}

const SEAT_TAKEN_INDEX = 'ux_reservation_seat_session_id_seat_id';

const sessionNotFound = () => new DomainError('not-found', 'session-not-found', 'Sessão não encontrada.');
/** Reserva de outro Cliente também responde 404: não revela que ela existe. */
const reservationNotFound = () =>
  new DomainError('not-found', 'reservation-not-found', 'Reserva não encontrada.');

export function bookingUseCases({ pool, repo }: BookingDeps) {
  const findOwned = async (appUserId: string, id: string): Promise<Reservation> => {
    const reservation = await repo(pool).findReservation(id);
    if (!reservation || reservation.ownerId !== appUserId) throw reservationNotFound();
    return reservation;
  };

  return {
    /**
     * Reserva de 1 a 6 Assentos, atômica. Numa transação:
     *  1. trava a Sessão (FOR SHARE) e checa que ela não começou;
     *  2. expira e libera as pendentes vencidas da Sessão (ADR 0001);
     *  3. checa que os Assentos são da Sala e não estão em manutenção;
     *  4. insere a Reserva e todos os Assentos num único INSERT.
     * O índice único parcial é quem garante a venda única: se outra transação
     * reteve algum Assento, o INSERT falha e nada é gravado ("todos ou nenhum").
     */
    async reserve(appUserId: string, input: { sessionId: string; seatIds: string[] }): Promise<Reservation> {
      assertValidSeatSelection(input.seatIds);

      let reservationId: string;
      try {
        reservationId = await withTransaction(pool, async (client) => {
          const r = repo(client);
          const session = await r.lockSessionForShare(input.sessionId);
          if (!session) throw sessionNotFound();

          const now = await databaseNow(client);
          assertSessionAcceptsReservations(session.startsAt, now);
          await r.expireOverdue(session.id);

          const seats = await r.findSeats(session.theaterId, input.seatIds);
          const found = new Set(seats.map((s) => s.id));
          const outside = input.seatIds.filter((id) => !found.has(id));
          if (outside.length > 0) {
            throw new DomainError('validation', 'seats-not-in-session', 'Assentos que não são da sala desta sessão.', {
              invalidSeats: outside,
            });
          }
          const inMaintenance = seats.filter((s) => s.underMaintenance);
          if (inMaintenance.length > 0) {
            throw new DomainError('conflict', 'seat-under-maintenance', 'Assentos em manutenção não podem ser reservados.', {
              seats: inMaintenance.map(({ id, label }) => ({ id, label })),
            });
          }

          return r.createReservation({
            sessionId: session.id,
            appUserId,
            expiresAt: holdExpiresAt(now),
            seatIds: input.seatIds,
          });
        });
      } catch (err) {
        if (isPgError(err) && err.code === '23505' && err.constraint === SEAT_TAKEN_INDEX) {
          // O Postgres só informa o primeiro assento em conflito; a lista completa
          // vem de uma consulta feita depois do rollback.
          const conflictingSeats = await repo(pool).findTakenSeats(input.sessionId, input.seatIds);
          throw new DomainError(
            'conflict',
            'seat-already-taken',
            'Um ou mais assentos já estão reservados ou vendidos nesta sessão.',
            { conflictingSeats },
          );
        }
        throw err;
      }

      return (await repo(pool).findReservation(reservationId))!;
    },

    /** Pagamento simulado. Idempotente: confirmar uma Venda devolve a Venda. */
    async confirm(appUserId: string, id: string): Promise<Reservation> {
      await withTransaction(pool, async (client) => {
        const r = repo(client);
        const locked = await r.lockReservation(id);
        if (!locked || locked.appUserId !== appUserId) throw reservationNotFound();
        if (decideConfirmation(locked, await databaseNow(client)) === 'confirm') await r.confirm(id);
      });
      return (await repo(pool).findReservation(id))!;
    },

    /** Cancela e libera os Assentos, até 2h antes do início. Idempotente. */
    async cancel(appUserId: string, id: string): Promise<Reservation> {
      await withTransaction(pool, async (client) => {
        const r = repo(client);
        const locked = await r.lockReservation(id);
        if (!locked || locked.appUserId !== appUserId) throw reservationNotFound();
        const decision = decideCancellation(locked, locked.sessionStartsAt, await databaseNow(client));
        if (decision === 'cancel') await r.cancel(id);
      });
      return (await repo(pool).findReservation(id))!;
    },

    get: findOwned,

    listMine: (appUserId: string): Promise<Reservation[]> => repo(pool).listByUser(appUserId),

    /** Estado de cada Assento da Sessão: livre, reservado, vendido ou indisponível. */
    async occupancy(sessionId: string): Promise<OccupancyMap> {
      const r = repo(pool);
      const session = await r.findSession(sessionId);
      if (!session) throw sessionNotFound();

      const summary: Record<SeatState, number> = { available: 0, reserved: 0, sold: 0, unavailable: 0 };
      const seats = (await r.occupancy(sessionId)).map(({ underMaintenance, hold, ...seat }) => {
        const state = seatState(underMaintenance, hold);
        summary[state]++;
        return { ...seat, state };
      });
      return { sessionId, startsAt: session.startsAt, seats, summary };
    },
  };
}
