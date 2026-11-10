import { z } from 'zod';
import { MAX_ROWS, MAX_SEATS_PER_ROW } from '../domain/seat-map.js';

export const idParam = z.object({ id: z.uuid() });

const seatLabels = z.array(z.string().trim().min(2).max(5)).max(3000);

export const createTheaterBody = z.object({
  name: z.string().trim().min(1).max(55),
  rows: z.int().min(1).max(MAX_ROWS),
  seatsPerRow: z.int().min(1).max(MAX_SEATS_PER_ROW),
  accessibleSeats: seatLabels.optional(),
  maintenanceSeats: seatLabels.optional(),
});

export const renameTheaterBody = z.object({ name: z.string().trim().min(1).max(55) });

export const updateSeatsBody = z.object({
  seats: z
    .array(
      z
        .object({
          seat: z.string().trim().min(2).max(5),
          accessible: z.boolean().optional(),
          underMaintenance: z.boolean().optional(),
        })
        .refine((s) => s.accessible !== undefined || s.underMaintenance !== undefined, {
          message: 'Informe accessible e/ou underMaintenance.',
        }),
    )
    .min(1)
    .max(3000),
});

const title = z.string().trim().min(1).max(200);
const duration = z.int().min(1).max(600);

export const createMovieBody = z.object({ title, duration });
export const updateMovieBody = z
  .object({ title: title.optional(), duration: duration.optional() })
  .refine((b) => b.title !== undefined || b.duration !== undefined, { message: 'Nada para alterar.' });

/** Valor em reais com no máximo 2 casas. */
const price = z
  .number()
  .min(0)
  .max(99_999_999.99)
  .refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-6, { message: 'Use no máximo 2 casas decimais.' });

/** Data/hora ISO 8601 com fuso explícito (ex.: 2026-11-20T19:30:00-03:00). */
const startsAt = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const createSessionBody = z.object({
  movieId: z.uuid(),
  theaterId: z.uuid(),
  startsAt,
  price,
});

export const updateSessionBody = z
  .object({ movieId: z.uuid().optional(), theaterId: z.uuid().optional(), startsAt: startsAt.optional(), price: price.optional() })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Nada para alterar.' });

export const listSessionsQuery = z.object({
  movieId: z.uuid().optional(),
  theaterId: z.uuid().optional(),
  date: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminListSessionsQuery = listSessionsQuery.extend({
  includePast: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
