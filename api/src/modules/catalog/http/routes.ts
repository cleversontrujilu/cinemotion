import type { Router } from 'express';
import type { TokenVerifier } from '../../identity/domain/ports.js';
import { requireAuth } from '../../identity/http/require-auth.js';
import { parseInput } from '../../../shared/http/validation.js';
import type { CatalogDeps } from '../application/deps.js';
import { movieUseCases } from '../application/movies.js';
import { sessionUseCases } from '../application/sessions.js';
import { theaterUseCases } from '../application/theaters.js';
import { presentSession } from './presenters.js';
import {
  adminListSessionsQuery,
  createMovieBody,
  createSessionBody,
  createTheaterBody,
  idParam,
  listSessionsQuery,
  renameTheaterBody,
  updateMovieBody,
  updateSessionBody,
  updateSeatsBody,
} from './schemas.js';

/** API do Cliente: leitura pública do catálogo (sem token), para navegar antes do login. */
export function mountCatalogPublicRoutes(router: Router, deps: CatalogDeps): void {
  const theaters = theaterUseCases(deps);
  const movies = movieUseCases(deps);
  const sessions = sessionUseCases(deps);

  router.get('/movies', async (_req, res) => {
    res.json(await movies.list());
  });

  router.get('/theaters', async (_req, res) => {
    res.json(await theaters.list());
  });

  router.get('/sessions', async (req, res) => {
    const query = parseInput(listSessionsQuery, req.query);
    const page = await sessions.list({ ...query, includePast: false });
    res.json({ ...page, items: page.items.map(presentSession) });
  });

  router.get('/sessions/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentSession(await sessions.get(id)));
  });
}

/** API do Administrador: gestão de Salas, Filmes e Sessões. Tudo exige token de admin. */
export function mountCatalogAdminRoutes(router: Router, deps: CatalogDeps & { tokens: TokenVerifier }): void {
  const theaters = theaterUseCases(deps);
  const movies = movieUseCases(deps);
  const sessions = sessionUseCases(deps);
  const auth = requireAuth(deps.tokens);

  // Salas
  router.post('/theaters', auth, async (req, res) => {
    const body = parseInput(createTheaterBody, req.body);
    const theater = await theaters.create(body);
    res.status(201).location(`/theaters/${theater.id}`).json(theater);
  });
  router.get('/theaters', auth, async (_req, res) => {
    res.json(await theaters.list());
  });
  router.get('/theaters/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(await theaters.get(id));
  });
  router.patch('/theaters/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    const { name } = parseInput(renameTheaterBody, req.body);
    res.json(await theaters.rename(id, name));
  });
  router.patch('/theaters/:id/seats', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    const { seats } = parseInput(updateSeatsBody, req.body);
    res.json(await theaters.updateSeats(id, seats.map(({ seat, ...marks }) => ({ label: seat, ...marks }))));
  });
  router.delete('/theaters/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await theaters.delete(id);
    res.status(204).end();
  });

  // Filmes
  router.post('/movies', auth, async (req, res) => {
    const movie = await movies.create(parseInput(createMovieBody, req.body));
    res.status(201).location(`/movies/${movie.id}`).json(movie);
  });
  router.get('/movies', auth, async (_req, res) => {
    res.json(await movies.list());
  });
  router.get('/movies/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(await movies.get(id));
  });
  router.patch('/movies/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(await movies.update(id, parseInput(updateMovieBody, req.body)));
  });
  router.delete('/movies/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await movies.delete(id);
    res.status(204).end();
  });

  // Sessões
  router.post('/sessions', auth, async (req, res) => {
    const session = await sessions.create(parseInput(createSessionBody, req.body));
    res.status(201).location(`/sessions/${session.id}`).json(presentSession(session));
  });
  router.get('/sessions', auth, async (req, res) => {
    const page = await sessions.list(parseInput(adminListSessionsQuery, req.query));
    res.json({ ...page, items: page.items.map(presentSession) });
  });
  router.get('/sessions/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentSession(await sessions.get(id)));
  });
  router.patch('/sessions/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    res.json(presentSession(await sessions.update(id, parseInput(updateSessionBody, req.body))));
  });
  router.delete('/sessions/:id', auth, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await sessions.delete(id);
    res.status(204).end();
  });
}
