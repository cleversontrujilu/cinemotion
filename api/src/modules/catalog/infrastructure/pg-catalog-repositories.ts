import type { Queryable } from '../../../shared/db/transaction.js';
import type { Movie, Seat, Session } from '../domain/model.js';
import type {
  CatalogRepositories,
  MovieRepository,
  SessionRepository,
  SessionRow,
  TheaterRepository,
} from '../domain/ports.js';
import { parseSeatLabel, seatLabel } from '../domain/seat-map.js';

interface SeatRecord {
  id: string;
  seat_row: string;
  number: number;
  is_accessible: boolean;
  is_available: boolean;
}

const toSeat = (r: SeatRecord): Seat => ({
  id: r.id,
  row: r.seat_row,
  number: r.number,
  label: seatLabel({ row: r.seat_row, number: r.number }),
  accessible: r.is_accessible,
  underMaintenance: !r.is_available,
});

/** Ordem natural do mapa: A..Z, AA.., e números crescentes. */
const SEAT_ORDER = 'length(seat_row), seat_row, number';

function theaterRepository(db: Queryable): TheaterRepository {
  const findById: TheaterRepository['findById'] = async (id) => {
    const theater = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM theater WHERE id = $1`,
      [id],
    );
    if (!theater.rows[0]) return null;
    const seats = await db.query<SeatRecord>(
      `SELECT id, seat_row, number, is_accessible, is_available
       FROM seat WHERE theater_id = $1 ORDER BY ${SEAT_ORDER}`,
      [id],
    );
    return { ...theater.rows[0], seats: seats.rows.map(toSeat) };
  };

  return {
    findById,

    async create({ name, seats }) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO theater (name) VALUES ($1) RETURNING id`,
        [name],
      );
      const id = rows[0]!.id;
      // Um único INSERT para o mapa inteiro.
      await db.query(
        `INSERT INTO seat (theater_id, seat_row, number, is_accessible, is_available)
         SELECT $1, r, n, a, NOT m
         FROM unnest($2::text[], $3::int2[], $4::bool[], $5::bool[]) AS s(r, n, a, m)`,
        [
          id,
          seats.map((s) => s.row),
          seats.map((s) => s.number),
          seats.map((s) => s.accessible),
          seats.map((s) => s.underMaintenance),
        ],
      );
      return (await findById(id))!;
    },

    async list() {
      const { rows } = await db.query<{ id: string; name: string; seat_count: string }>(
        `SELECT t.id, t.name, count(s.id) AS seat_count
         FROM theater t LEFT JOIN seat s ON s.theater_id = t.id
         GROUP BY t.id ORDER BY t.name`,
      );
      return rows.map((r) => ({ id: r.id, name: r.name, seatCount: Number(r.seat_count) }));
    },

    async rename(id, name) {
      const { rowCount } = await db.query(`UPDATE theater SET name = $2 WHERE id = $1`, [id, name]);
      return rowCount === 1;
    },

    async updateMarkings(theaterId, markings) {
      const positions = markings.map((m) => ({ marking: m, position: parseSeatLabel(m.label) }));
      const valid = positions.filter((p) => p.position !== null);

      const { rows } = await db.query<{ label: string }>(
        `SELECT seat_row || number AS label FROM seat
         WHERE theater_id = $1 AND (seat_row, number) IN (
           SELECT * FROM unnest($2::text[], $3::int2[]))`,
        [theaterId, valid.map((p) => p.position!.row), valid.map((p) => p.position!.number)],
      );
      const existing = new Set(rows.map((r) => r.label));
      const unknown = positions
        .filter((p) => !p.position || !existing.has(seatLabel(p.position)))
        .map((p) => p.marking.label);
      if (unknown.length > 0) return { unknown };

      // NULL em accessible/maintenance = manter o valor atual.
      await db.query(
        `UPDATE seat SET
           is_accessible = coalesce(m.accessible, seat.is_accessible),
           is_available  = coalesce(NOT m.maintenance, seat.is_available)
         FROM unnest($2::text[], $3::int2[], $4::bool[], $5::bool[]) AS m(r, n, accessible, maintenance)
         WHERE seat.theater_id = $1 AND seat.seat_row = m.r AND seat.number = m.n`,
        [
          theaterId,
          valid.map((p) => p.position!.row),
          valid.map((p) => p.position!.number),
          valid.map((p) => p.marking.accessible ?? null),
          valid.map((p) => p.marking.underMaintenance ?? null),
        ],
      );
      return { unknown: [] };
    },

    async delete(id) {
      const { rowCount } = await db.query(`DELETE FROM theater WHERE id = $1`, [id]);
      return rowCount === 1;
    },
  };
}

function movieRepository(db: Queryable): MovieRepository {
  return {
    async create({ title, duration }) {
      const { rows } = await db.query<Movie>(
        `INSERT INTO movie (title, duration) VALUES ($1, $2) RETURNING id, title, duration`,
        [title, duration],
      );
      return rows[0]!;
    },
    async list() {
      const { rows } = await db.query<Movie>(`SELECT id, title, duration FROM movie ORDER BY title`);
      return rows;
    },
    async findById(id) {
      const { rows } = await db.query<Movie>(`SELECT id, title, duration FROM movie WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },
    async update(id, { title, duration }) {
      const { rows } = await db.query<Movie>(
        `UPDATE movie SET title = coalesce($2, title), duration = coalesce($3, duration)
         WHERE id = $1 RETURNING id, title, duration`,
        [id, title ?? null, duration ?? null],
      );
      return rows[0] ?? null;
    },
    async delete(id) {
      const { rowCount } = await db.query(`DELETE FROM movie WHERE id = $1`, [id]);
      return rowCount === 1;
    },
  };
}

interface SessionRecord {
  id: string;
  starts_at: Date;
  ends_at: Date;
  price: string;
  movie_id: string;
  movie_title: string;
  movie_duration: number;
  theater_id: string;
  theater_name: string;
}

const SESSION_COLUMNS = `
  s.id, s.starts_at, s.ends_at, s.price,
  m.id AS movie_id, m.title AS movie_title, m.duration AS movie_duration,
  t.id AS theater_id, t.name AS theater_name`;

const SESSION_FROM = `
  FROM session s
  JOIN movie m ON m.id = s.movie_id
  JOIN theater t ON t.id = s.theater_id`;

const toSession = (r: SessionRecord): Session => ({
  id: r.id,
  movie: { id: r.movie_id, title: r.movie_title, duration: r.movie_duration },
  theater: { id: r.theater_id, name: r.theater_name },
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  price: Number(r.price),
});

function sessionRepository(db: Queryable): SessionRepository {
  return {
    async create({ movieId, theaterId, startsAt, endsAt, price }) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [movieId, theaterId, startsAt, endsAt, price],
      );
      return rows[0]!.id;
    },

    async findById(id) {
      const { rows } = await db.query<SessionRecord>(`SELECT ${SESSION_COLUMNS} ${SESSION_FROM} WHERE s.id = $1`, [id]);
      return rows[0] ? toSession(rows[0]) : null;
    },

    async lockById(id) {
      const { rows } = await db.query<{
        id: string;
        movie_id: string;
        theater_id: string;
        starts_at: Date;
        ends_at: Date;
        price: string;
      }>(
        `SELECT id, movie_id, theater_id, starts_at, ends_at, price FROM session WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const r = rows[0];
      return r
        ? {
            id: r.id,
            movieId: r.movie_id,
            theaterId: r.theater_id,
            startsAt: r.starts_at,
            endsAt: r.ends_at,
            price: Number(r.price),
          }
        : null;
    },

    async update(id, { movieId, theaterId, startsAt, endsAt, price }: Omit<SessionRow, 'id'>) {
      await db.query(
        `UPDATE session SET movie_id = $2, theater_id = $3, starts_at = $4, ends_at = $5, price = $6
         WHERE id = $1`,
        [id, movieId, theaterId, startsAt, endsAt, price],
      );
    },

    async delete(id) {
      await db.query(`DELETE FROM session WHERE id = $1`, [id]);
    },

    async countActiveReservations(sessionId) {
      // Ativa = Venda ou pendente ainda no prazo (pendente vencida conta como expirada; ADR 0001).
      const { rows } = await db.query<{ count: string }>(
        `SELECT count(*) FROM reservation
         WHERE session_id = $1
           AND (status = 'confirmed' OR (status = 'pending' AND expires_at > now()))`,
        [sessionId],
      );
      return Number(rows[0]!.count);
    },

    async list(filters, timezone) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const param = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };

      if (!filters.includePast) conditions.push('s.starts_at > now()');
      if (filters.movieId) conditions.push(`s.movie_id = ${param(filters.movieId)}`);
      if (filters.theaterId) conditions.push(`s.theater_id = ${param(filters.theaterId)}`);
      if (filters.date) {
        // Dia da Sessão no fuso da rede. Intervalo [dia, dia+1) para usar o índice de starts_at.
        const tz = param(timezone);
        const day = param(filters.date);
        conditions.push(
          `s.starts_at >= (${day}::date)::timestamp AT TIME ZONE ${tz}` +
            ` AND s.starts_at < (${day}::date + 1)::timestamp AT TIME ZONE ${tz}`,
        );
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = param(filters.pageSize);
      const offset = param((filters.page - 1) * filters.pageSize);

      const { rows } = await db.query<SessionRecord & { total: string }>(
        `SELECT count(*) OVER () AS total, ${SESSION_COLUMNS} ${SESSION_FROM} ${where}
         ORDER BY s.starts_at, t.name
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      // Página além da última não traz linhas (nem o total da janela): conta à parte.
      let total = rows[0] ? Number(rows[0].total) : 0;
      if (!rows[0] && filters.page > 1) {
        const counted = await db.query<{ count: string }>(
          `SELECT count(*) ${SESSION_FROM} ${where}`,
          params.slice(0, params.length - 2),
        );
        total = Number(counted.rows[0]!.count);
      }

      return {
        items: rows.map(toSession),
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      };
    },
  };
}

export const pgCatalogRepositories = (db: Queryable): CatalogRepositories => ({
  theaters: theaterRepository(db),
  movies: movieRepository(db),
  sessions: sessionRepository(db),
});
