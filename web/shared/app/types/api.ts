// Formatos da API, conforme docs/swagger.yaml.

export type Role = 'customer' | 'admin'

export interface Token {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export interface User {
  id: string
  email: string
  role: Role
}

export interface Movie {
  id: string
  title: string
  /** Duração em minutos. */
  duration: number
}

export interface Seat {
  id: string
  row: string
  number: number
  label: string
  accessible: boolean
  underMaintenance: boolean
}

export interface TheaterSummary {
  id: string
  name: string
  seatCount: number
}

export interface Theater {
  id: string
  name: string
  seats: Seat[]
}

export interface Session {
  id: string
  movie: Movie
  theater: { id: string, name: string }
  startsAt: string
  endsAt: string
  price: number
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SeatState = 'available' | 'reserved' | 'sold' | 'unavailable'

export interface OccupancySeat {
  id: string
  label: string
  row: string
  number: number
  accessible: boolean
  state: SeatState
}

export interface OccupancyMap {
  sessionId: string
  startsAt: string
  seats: OccupancySeat[]
  summary: Record<SeatState, number>
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired'

export interface Reservation {
  id: string
  status: ReservationStatus
  createdAt: string
  expiresAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  session: { id: string, startsAt: string, movieTitle: string, theaterName: string, price: number }
  seats: { id: string, label: string }[]
  total: number
}

/** Problem Details (RFC 9457), com os campos extras que a API usa. */
export interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: { path: string, message: string }[]
  conflictingSeats?: { id: string, label: string }[]
  deadline?: string
}
