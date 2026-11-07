/** Estado de um Assento numa Sessão, como o mapa de ocupação mostra. */
export type SeatState = 'available' | 'reserved' | 'sold' | 'unavailable';

/** Retenção ativa do Assento na Sessão: Reserva pendente no prazo ou Venda. */
export type ActiveHold = 'pending' | 'confirmed' | null;

/**
 * Reservado e vendido prevalecem sobre indisponível: um Assento que entra em
 * manutenção depois de vendido continua aparecendo como vendido.
 */
export function seatState(underMaintenance: boolean, hold: ActiveHold): SeatState {
  if (hold === 'confirmed') return 'sold';
  if (hold === 'pending') return 'reserved';
  return underMaintenance ? 'unavailable' : 'available';
}
