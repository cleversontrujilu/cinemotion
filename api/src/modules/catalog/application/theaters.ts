import { withTransaction } from '../../../shared/db/transaction.js';
import { DomainError } from '../../../shared/domain/errors.js';
import type { Theater, TheaterSummary } from '../domain/model.js';
import type { SeatMarking } from '../domain/ports.js';
import { buildSeatMap, parseSeatLabel, seatLabel, unknownSeatLabels } from '../domain/seat-map.js';
import type { CatalogDeps } from './deps.js';
import { theaterNotFound } from './errors.js';

export interface CreateTheaterInput {
  name: string;
  rows: number;
  seatsPerRow: number;
  accessibleSeats?: string[] | undefined;
  maintenanceSeats?: string[] | undefined;
}

const unknownSeats = (unknown: string[]) =>
  new DomainError('validation', 'unknown-seats', 'Assentos inexistentes no mapa da sala.', {
    unknownSeats: unknown,
  });

const normalizedLabel = (label: string) => {
  const position = parseSeatLabel(label);
  return position ? seatLabel(position) : label;
};

export function theaterUseCases({ pool, repos }: CatalogDeps) {
  return {
    /** Cria a Sala com o mapa inteiro numa transação. */
    async create(input: CreateTheaterInput): Promise<Theater> {
      const map = buildSeatMap(input.rows, input.seatsPerRow);
      const accessible = input.accessibleSeats ?? [];
      const maintenance = input.maintenanceSeats ?? [];

      const unknown = unknownSeatLabels(map, [...accessible, ...maintenance]);
      if (unknown.length > 0) throw unknownSeats([...new Set(unknown)]);

      const accessibleSet = new Set(accessible.map(normalizedLabel));
      const maintenanceSet = new Set(maintenance.map(normalizedLabel));
      const seats = map.map((position) => ({
        ...position,
        accessible: accessibleSet.has(seatLabel(position)),
        underMaintenance: maintenanceSet.has(seatLabel(position)),
      }));

      return withTransaction(pool, (client) => repos(client).theaters.create({ name: input.name, seats }));
    },

    list(): Promise<TheaterSummary[]> {
      return repos(pool).theaters.list();
    },

    async get(id: string): Promise<Theater> {
      return (await repos(pool).theaters.findById(id)) ?? Promise.reject(theaterNotFound());
    },

    async rename(id: string, name: string): Promise<Theater> {
      const { theaters } = repos(pool);
      if (!(await theaters.rename(id, name))) throw theaterNotFound();
      return (await theaters.findById(id))!;
    },

    /**
     * Muda só as marcações (acessível / em manutenção). O mapa é imutável.
     * Assento em manutenção não aceita novas Reservas; as existentes continuam valendo.
     */
    async updateSeats(id: string, markings: SeatMarking[]): Promise<Theater> {
      return withTransaction(pool, async (client) => {
        const { theaters } = repos(client);
        if (!(await theaters.findById(id))) throw theaterNotFound();
        const { unknown } = await theaters.updateMarkings(id, markings);
        if (unknown.length > 0) throw unknownSeats(unknown);
        return (await theaters.findById(id))!;
      });
    },

    /** Sala com Sessões não pode ser removida (FK RESTRICT → 409 in-use). */
    async delete(id: string): Promise<void> {
      if (!(await repos(pool).theaters.delete(id))) throw theaterNotFound();
    },
  };
}
