import type { SeatState } from './occupancy.js';
import type { StoredStatus } from './reservation.js';

export interface SeatRef {
  id: string;
  label: string;
}

export interface Reservation {
  id: string;
  /** Cliente dono da Reserva. Não sai na resposta. */
  ownerId: string;
  status: StoredStatus;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  session: { id: string; startsAt: Date; movieTitle: string; theaterName: string; price: number };
  seats: SeatRef[];
  total: number;
}

export interface OccupancySeat {
  id: string;
  label: string;
  row: string;
  number: number;
  accessible: boolean;
  state: SeatState;
}

export interface OccupancyMap {
  sessionId: string;
  startsAt: Date;
  seats: OccupancySeat[];
  summary: Record<SeatState, number>;
}
