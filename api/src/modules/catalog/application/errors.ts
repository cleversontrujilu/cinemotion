import { DomainError } from '../../../shared/domain/errors.js';

export const theaterNotFound = () => new DomainError('not-found', 'theater-not-found', 'Sala não encontrada.');
export const movieNotFound = () => new DomainError('not-found', 'movie-not-found', 'Filme não encontrado.');
export const sessionNotFound = () => new DomainError('not-found', 'session-not-found', 'Sessão não encontrada.');
