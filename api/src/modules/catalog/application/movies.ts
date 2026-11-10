import type { Movie } from '../domain/model.js';
import type { CatalogDeps } from './deps.js';
import { movieNotFound } from './errors.js';

export function movieUseCases({ pool, repos }: CatalogDeps) {
  return {
    create: (input: { title: string; duration: number }): Promise<Movie> => repos(pool).movies.create(input),

    list: (): Promise<Movie[]> => repos(pool).movies.list(),

    async get(id: string): Promise<Movie> {
      return (await repos(pool).movies.findById(id)) ?? Promise.reject(movieNotFound());
    },

    /** Mudar a duração não altera o fim das Sessões já criadas (fixado na criação). */
    async update(id: string, input: { title?: string | undefined; duration?: number | undefined }): Promise<Movie> {
      return (await repos(pool).movies.update(id, input)) ?? Promise.reject(movieNotFound());
    },

    /** Filme com Sessões não pode ser removido (FK RESTRICT → 409 in-use). */
    async delete(id: string): Promise<void> {
      if (!(await repos(pool).movies.delete(id))) throw movieNotFound();
    },
  };
}
