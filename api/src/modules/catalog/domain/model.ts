export interface Movie {
  id: string;
  title: string;
  /** Minutos. */
  duration: number;
}

export interface Seat {
  id: string;
  row: string;
  number: number;
  label: string;
  accessible: boolean;
  underMaintenance: boolean;
}

export interface TheaterSummary {
  id: string;
  name: string;
  seatCount: number;
}

export interface Theater {
  id: string;
  name: string;
  seats: Seat[];
}

export interface Session {
  id: string;
  movie: { id: string; title: string; duration: number };
  theater: { id: string; name: string };
  startsAt: Date;
  endsAt: Date;
  price: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
