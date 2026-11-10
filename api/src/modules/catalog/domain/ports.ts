import type { Queryable } from '../../../shared/db/transaction.js';
import type { SeatPosition } from './seat-map.js';
import type { Movie, Page, Session, Theater, TheaterSummary } from './model.js';

export interface SeatMarking {
  label: string;
  accessible?: boolean | undefined;
  underMaintenance?: boolean | undefined;
}

export interface TheaterRepository {
  create(data: {
    name: string;
    seats: Array<SeatPosition & { accessible: boolean; underMaintenance: boolean }>;
  }): Promise<Theater>;
  list(): Promise<TheaterSummary[]>;
  findById(id: string): Promise<Theater | null>;
  rename(id: string, name: string): Promise<boolean>;
  /** Aplica as marcações. Devolve os rótulos que não existem na Sala (nada é alterado se houver algum). */
  updateMarkings(theaterId: string, markings: SeatMarking[]): Promise<{ unknown: string[] }>;
  delete(id: string): Promise<boolean>;
}

export interface MovieRepository {
  create(data: { title: string; duration: number }): Promise<Movie>;
  list(): Promise<Movie[]>;
  findById(id: string): Promise<Movie | null>;
  update(id: string, data: { title?: string | undefined; duration?: number | undefined }): Promise<Movie | null>;
  delete(id: string): Promise<boolean>;
}

export interface SessionFilters {
  movieId?: string | undefined;
  theaterId?: string | undefined;
  /** YYYY-MM-DD no fuso da rede. */
  date?: string | undefined;
  /** Só a API admin lista Sessões passadas. */
  includePast?: boolean | undefined;
  page: number;
  pageSize: number;
}

export interface SessionRow {
  id: string;
  movieId: string;
  theaterId: string;
  startsAt: Date;
  endsAt: Date;
  price: number;
}

export interface SessionRepository {
  create(data: Omit<SessionRow, 'id'>): Promise<string>;
  findById(id: string): Promise<Session | null>;
  /** Lê e trava a linha (FOR UPDATE) até o fim da transação. */
  lockById(id: string): Promise<SessionRow | null>;
  update(id: string, data: Omit<SessionRow, 'id'>): Promise<void>;
  delete(id: string): Promise<void>;
  countActiveReservations(sessionId: string): Promise<number>;
  list(filters: SessionFilters, timezone: string): Promise<Page<Session>>;
}

/** Repositórios ligados a uma conexão (pool ou client de transação). */
export interface CatalogRepositories {
  theaters: TheaterRepository;
  movies: MovieRepository;
  sessions: SessionRepository;
}

export type CatalogRepositoriesFactory = (db: Queryable) => CatalogRepositories;
