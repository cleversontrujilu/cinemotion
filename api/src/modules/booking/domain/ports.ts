import type { Queryable } from '../../../shared/db/transaction.js';
import type { ActiveHold } from './occupancy.js';
import type { Reservation, SeatRef } from './model.js';
import type { StoredStatus } from './reservation.js';

export interface SessionForBooking {
  id: string;
  theaterId: string;
  startsAt: Date;
  price: number;
}

export interface SeatForBooking extends SeatRef {
  underMaintenance: boolean;
}

export interface LockedReservation {
  id: string;
  appUserId: string;
  status: StoredStatus;
  expiresAt: Date;
  sessionStartsAt: Date;
}

export interface BookingRepository {
  /** Lê a Sessão com FOR SHARE: impede que ela seja editada até o fim da transação. */
  lockSessionForShare(sessionId: string): Promise<SessionForBooking | null>;
  findSession(sessionId: string): Promise<SessionForBooking | null>;
  /** Marca como expiradas e libera as pendentes vencidas da Sessão (ADR 0001). */
  expireOverdue(sessionId: string): Promise<number>;
  findSeats(theaterId: string, seatIds: string[]): Promise<SeatForBooking[]>;
  createReservation(data: { sessionId: string; appUserId: string; expiresAt: Date; seatIds: string[] }): Promise<string>;
  /** Assentos pedidos que estão retidos por Reserva ativa (pendente no prazo ou Venda). */
  findTakenSeats(sessionId: string, seatIds: string[]): Promise<SeatRef[]>;
  lockReservation(id: string): Promise<LockedReservation | null>;
  confirm(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  findReservation(id: string): Promise<Reservation | null>;
  listByUser(appUserId: string): Promise<Reservation[]>;
  occupancy(sessionId: string): Promise<Array<{
    id: string;
    label: string;
    row: string;
    number: number;
    accessible: boolean;
    underMaintenance: boolean;
    hold: ActiveHold;
  }>>;
}

export type BookingRepositoryFactory = (db: Queryable) => BookingRepository;
