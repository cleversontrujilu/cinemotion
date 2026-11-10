import type { Session } from '../domain/model.js';

/** Datas saem em ISO 8601 UTC; o frontend formata no fuso da rede. */
export const presentSession = (s: Session) => ({
  id: s.id,
  movie: s.movie,
  theater: s.theater,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
  price: s.price,
});
