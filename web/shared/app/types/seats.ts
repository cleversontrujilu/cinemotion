/** Estado visual de um assento no SeatGrid. Quem usa o mapa decide qual se aplica. */
export type SeatLook = 'available' | 'selected' | 'reserved' | 'sold' | 'unavailable' | 'conflict'

/** O mínimo que o SeatGrid precisa de um assento (serve para o mapa da Sessão e o da Sala). */
export interface GridSeat {
  id: string
  label: string
  row: string
  number: number
  accessible: boolean
}
