import type { OccupancyMap, Reservation } from '../domain/model.js';

/** Datas em ISO 8601 UTC (ADR 0002). O dono não sai na resposta. */
export const presentReservation = ({ ownerId: _ownerId, ...r }: Reservation) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  expiresAt: r.expiresAt.toISOString(),
  confirmedAt: r.confirmedAt?.toISOString() ?? null,
  cancelledAt: r.cancelledAt?.toISOString() ?? null,
  session: { ...r.session, startsAt: r.session.startsAt.toISOString() },
});

export const presentOccupancy = (map: OccupancyMap) => ({ ...map, startsAt: map.startsAt.toISOString() });
