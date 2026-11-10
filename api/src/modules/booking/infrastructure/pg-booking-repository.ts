import type { Queryable } from '../../../shared/db/transaction.js';
import type { Reservation } from '../domain/model.js';
import type { BookingRepository, SessionForBooking } from '../domain/ports.js';
import type { StoredStatus } from '../domain/reservation.js';

/** Retenção ativa: o assento não foi liberado e a Reserva é Venda ou pendente no prazo. */
const ACTIVE_HOLD = `
  rs.released_at IS NULL
  AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > now()))`;

/** Status real: pendente vencida aparece como expirada (ADR 0001). */
const EFFECTIVE_STATUS = `
  CASE WHEN r.status = 'pending' AND r.expires_at <= now() THEN 'expired' ELSE r.status::text END`;

const SEAT_LABEL = `s.seat_row || s.number`;

interface SessionRecord {
  id: string;
  theater_id: string;
  starts_at: Date;
  price: string;
}

const toSession = (r: SessionRecord): SessionForBooking => ({
  id: r.id,
  theaterId: r.theater_id,
  startsAt: r.starts_at,
  price: Number(r.price),
});

interface ReservationRecord {
  id: string;
  app_user_id: string;
  status: StoredStatus;
  created_at: Date;
  expires_at: Date;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  session_id: string;
  starts_at: Date;
  movie_title: string;
  theater_name: string;
  price: string;
  seats: Array<{ id: string; label: string }>;
}

const RESERVATION_SELECT = `
  SELECT r.id, r.app_user_id, ${EFFECTIVE_STATUS} AS status, r.created_at, r.expires_at, r.confirmed_at, r.cancelled_at,
         se.id AS session_id, se.starts_at, se.price, m.title AS movie_title, t.name AS theater_name,
         (SELECT json_agg(json_build_object('id', s.id, 'label', ${SEAT_LABEL})
                          ORDER BY length(s.seat_row), s.seat_row, s.number)
          FROM reservation_seat rs JOIN seat s ON s.id = rs.seat_id
          WHERE rs.reservation_id = r.id) AS seats
  FROM reservation r
  JOIN session se ON se.id = r.session_id
  JOIN movie m ON m.id = se.movie_id
  JOIN theater t ON t.id = se.theater_id`;

const toReservation = (r: ReservationRecord): Reservation => {
  const price = Number(r.price);
  const seats = r.seats ?? [];
  return {
    id: r.id,
    ownerId: r.app_user_id,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    confirmedAt: r.confirmed_at,
    cancelledAt: r.cancelled_at,
    session: {
      id: r.session_id,
      startsAt: r.starts_at,
      movieTitle: r.movie_title,
      theaterName: r.theater_name,
      price,
    },
    seats,
    // Em centavos para não acumular erro de ponto flutuante.
    total: Math.round(price * 100 * seats.length) / 100,
  };
};

export function pgBookingRepository(db: Queryable): BookingRepository {
  return {
    async lockSessionForShare(sessionId) {
      const { rows } = await db.query<SessionRecord>(
        // Função SECURITY DEFINER (migration 0002): o role do Cliente não tem UPDATE em session.
        `SELECT id, theater_id, starts_at, price FROM lock_session_for_booking($1)`,
        [sessionId],
      );
      return rows[0] ? toSession(rows[0]) : null;
    },

    async findSession(sessionId) {
      const { rows } = await db.query<SessionRecord>(
        `SELECT id, theater_id, starts_at, price FROM session WHERE id = $1`,
        [sessionId],
      );
      return rows[0] ? toSession(rows[0]) : null;
    },

    async expireOverdue(sessionId) {
      const { rowCount } = await db.query(
        `WITH expired AS (
           UPDATE reservation SET status = 'expired'
           WHERE session_id = $1 AND status = 'pending' AND expires_at <= now()
           RETURNING id, expires_at
         )
         UPDATE reservation_seat rs SET released_at = e.expires_at
         FROM expired e
         WHERE rs.reservation_id = e.id AND rs.released_at IS NULL`,
        [sessionId],
      );
      return rowCount ?? 0;
    },

    async findSeats(theaterId, seatIds) {
      const { rows } = await db.query<{ id: string; label: string; is_available: boolean }>(
        `SELECT s.id, ${SEAT_LABEL} AS label, s.is_available
         FROM seat s WHERE s.theater_id = $1 AND s.id = ANY($2::uuid[])`,
        [theaterId, seatIds],
      );
      return rows.map((r) => ({ id: r.id, label: r.label, underMaintenance: !r.is_available }));
    },

    async createReservation({ sessionId, appUserId, expiresAt, seatIds }) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO reservation (session_id, app_user_id, expires_at, created_at)
         VALUES ($1, $2, $3, now()) RETURNING id`,
        [sessionId, appUserId, expiresAt],
      );
      const id = rows[0]!.id;
      // Todos os assentos num único INSERT: o índice único parcial decide "todos ou nenhum".
      await db.query(
        `INSERT INTO reservation_seat (reservation_id, session_id, seat_id)
         SELECT $1, $2, unnest($3::uuid[])`,
        [id, sessionId, seatIds],
      );
      return id;
    },

    async findTakenSeats(sessionId, seatIds) {
      const { rows } = await db.query<{ id: string; label: string }>(
        `SELECT s.id, ${SEAT_LABEL} AS label
         FROM reservation_seat rs
         JOIN reservation r ON r.id = rs.reservation_id
         JOIN seat s ON s.id = rs.seat_id
         WHERE rs.session_id = $1 AND rs.seat_id = ANY($2::uuid[]) AND ${ACTIVE_HOLD}
         ORDER BY length(s.seat_row), s.seat_row, s.number`,
        [sessionId, seatIds],
      );
      return rows;
    },

    async lockReservation(id) {
      const { rows } = await db.query<{
        id: string;
        app_user_id: string;
        status: StoredStatus;
        expires_at: Date;
        starts_at: Date;
      }>(
        `SELECT r.id, r.app_user_id, r.status, r.expires_at, se.starts_at
         FROM reservation r JOIN session se ON se.id = r.session_id
         WHERE r.id = $1
         FOR UPDATE OF r`,
        [id],
      );
      const r = rows[0];
      return r
        ? { id: r.id, appUserId: r.app_user_id, status: r.status, expiresAt: r.expires_at, sessionStartsAt: r.starts_at }
        : null;
    },

    async confirm(id) {
      await db.query(`UPDATE reservation SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [id]);
    },

    async cancel(id) {
      await db.query(
        `WITH cancelled AS (
           UPDATE reservation SET status = 'cancelled', cancelled_at = now() WHERE id = $1 RETURNING id
         )
         UPDATE reservation_seat SET released_at = now()
         WHERE reservation_id = (SELECT id FROM cancelled) AND released_at IS NULL`,
        [id],
      );
    },

    async findReservation(id) {
      const { rows } = await db.query<ReservationRecord>(`${RESERVATION_SELECT} WHERE r.id = $1`, [id]);
      return rows[0] ? toReservation(rows[0]) : null;
    },

    async listByUser(appUserId) {
      const { rows } = await db.query<ReservationRecord>(
        `${RESERVATION_SELECT} WHERE r.app_user_id = $1 ORDER BY r.created_at DESC`,
        [appUserId],
      );
      return rows.map(toReservation);
    },

    async occupancy(sessionId) {
      const { rows } = await db.query<{
        id: string;
        label: string;
        seat_row: string;
        number: number;
        is_accessible: boolean;
        is_available: boolean;
        hold: 'pending' | 'confirmed' | null;
      }>(
        `SELECT s.id, ${SEAT_LABEL} AS label, s.seat_row, s.number, s.is_accessible, s.is_available,
                h.status AS hold
         FROM session se
         JOIN seat s ON s.theater_id = se.theater_id
         LEFT JOIN LATERAL (
           SELECT r.status::text AS status
           FROM reservation_seat rs JOIN reservation r ON r.id = rs.reservation_id
           WHERE rs.session_id = se.id AND rs.seat_id = s.id AND ${ACTIVE_HOLD}
           LIMIT 1
         ) h ON true
         WHERE se.id = $1
         ORDER BY length(s.seat_row), s.seat_row, s.number`,
        [sessionId],
      );
      return rows.map((r) => ({
        id: r.id,
        label: r.label,
        row: r.seat_row,
        number: r.number,
        accessible: r.is_accessible,
        underMaintenance: !r.is_available,
        hold: r.hold,
      }));
    },
  };
}
