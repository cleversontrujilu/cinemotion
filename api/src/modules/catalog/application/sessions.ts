import { databaseNow, withTransaction } from '../../../shared/db/transaction.js';
import type { Page, Session } from '../domain/model.js';
import type { SessionFilters } from '../domain/ports.js';
import { assertNoActiveReservations, assertStartsInFuture, computeEndsAt } from '../domain/session.js';
import type { CatalogDeps } from './deps.js';
import { movieNotFound, sessionNotFound, theaterNotFound } from './errors.js';

export interface CreateSessionInput {
  movieId: string;
  theaterId: string;
  startsAt: Date;
  price: number;
}

export type UpdateSessionInput = { [K in keyof CreateSessionInput]?: CreateSessionInput[K] | undefined };

export function sessionUseCases({ pool, repos, timezone }: CatalogDeps) {
  return {
    /**
     * Cria a Sessão. O fim é fixado agora (duração atual do Filme + 15 min); a
     * sobreposição na Sala é garantida pela exclusion constraint session_no_overlap.
     */
    async create(input: CreateSessionInput): Promise<Session> {
      return withTransaction(pool, async (client) => {
        const { movies, theaters, sessions } = repos(client);
        assertStartsInFuture(input.startsAt, await databaseNow(client));

        const movie = await movies.findById(input.movieId);
        if (!movie) throw movieNotFound();
        if (!(await theaters.findById(input.theaterId))) throw theaterNotFound();

        const id = await sessions.create({
          movieId: movie.id,
          theaterId: input.theaterId,
          startsAt: input.startsAt,
          endsAt: computeEndsAt(input.startsAt, movie.duration),
          price: input.price,
        });
        return (await sessions.findById(id))!;
      });
    },

    async get(id: string): Promise<Session> {
      return (await repos(pool).sessions.findById(id)) ?? Promise.reject(sessionNotFound());
    },

    list(filters: SessionFilters): Promise<Page<Session>> {
      return repos(pool).sessions.list(filters, timezone);
    },

    /**
     * Edita a Sessão se ela não tiver Reserva ativa. A linha fica travada (FOR UPDATE)
     * durante a checagem e a escrita; a criação de Reserva trava a mesma linha com
     * FOR SHARE, então as duas operações nunca se cruzam.
     */
    async update(id: string, input: UpdateSessionInput): Promise<Session> {
      return withTransaction(pool, async (client) => {
        const { movies, theaters, sessions } = repos(client);
        const current = await sessions.lockById(id);
        if (!current) throw sessionNotFound();
        assertNoActiveReservations(await sessions.countActiveReservations(id));

        const next = {
          movieId: input.movieId ?? current.movieId,
          theaterId: input.theaterId ?? current.theaterId,
          startsAt: input.startsAt ?? current.startsAt,
          endsAt: current.endsAt,
          price: input.price ?? current.price,
        };

        // Reagendar ou trocar o Filme recalcula o fim com a duração atual do Filme.
        const reschedules =
          next.movieId !== current.movieId || next.startsAt.getTime() !== current.startsAt.getTime();
        if (reschedules) {
          assertStartsInFuture(next.startsAt, await databaseNow(client));
          const movie = await movies.findById(next.movieId);
          if (!movie) throw movieNotFound();
          next.endsAt = computeEndsAt(next.startsAt, movie.duration);
        }
        if (next.theaterId !== current.theaterId && !(await theaters.findById(next.theaterId))) {
          throw theaterNotFound();
        }

        await sessions.update(id, next);
        return (await sessions.findById(id))!;
      });
    },

    /** Exclui a Sessão se não houver Reserva ativa. Com histórico de Reservas, FK RESTRICT → 409 in-use. */
    async delete(id: string): Promise<void> {
      await withTransaction(pool, async (client) => {
        const { sessions } = repos(client);
        if (!(await sessions.lockById(id))) throw sessionNotFound();
        assertNoActiveReservations(await sessions.countActiveReservations(id));
        await sessions.delete(id);
      });
    },
  };
}
