import type { Router } from 'express';
import { z } from 'zod';
import type { TokenVerifier } from '../../identity/domain/ports.js';
import { currentUser, requireAuth } from '../../identity/http/require-auth.js';
import { parseInput } from '../../../shared/http/validation.js';
import { bookingUseCases, type BookingDeps } from '../application/booking.js';
import { MAX_SEATS_PER_RESERVATION } from '../domain/reservation.js';
import { presentOccupancy, presentReservation } from './presenters.js';

const idParam = z.object({ id: z.uuid() });

const reserveBody = z.object({
  sessionId: z.uuid(),
  seatIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_SEATS_PER_RESERVATION)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Assentos repetidos.' }),
});

/** Rotas de reserva da API do Cliente. */
export function mountBookingRoutes(router: Router, deps: BookingDeps & { tokens: TokenVerifier }): void {
  const booking = bookingUseCases(deps);
  const auth = requireAuth(deps.tokens);

  // Público: o mapa de ocupação ajuda a escolher antes do login.
  router.get('/sessions/:id/seats', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentOccupancy(await booking.occupancy(id)));
  });

  router.post('/reservations', auth, async (req, res) => {
    const body = parseInput(reserveBody, req.body);
    const reservation = await booking.reserve(currentUser(req).id, body);
    res.status(201).location(`${req.baseUrl}/reservations/${reservation.id}`).json(presentReservation(reservation));
  });

  router.get('/reservations', auth, async (req, res) => {
    res.json((await booking.listMine(currentUser(req).id)).map(presentReservation));
  });

  router.get('/reservations/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentReservation(await booking.get(currentUser(req).id, id)));
  });

  router.post('/reservations/:id/confirm', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentReservation(await booking.confirm(currentUser(req).id, id)));
  });

  router.post('/reservations/:id/cancel', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentReservation(await booking.cancel(currentUser(req).id, id)));
  });
}
