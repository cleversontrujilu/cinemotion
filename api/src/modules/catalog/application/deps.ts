import type { Pool } from 'pg';
import type { CatalogRepositoriesFactory } from '../domain/ports.js';

export interface CatalogDeps {
  pool: Pool;
  repos: CatalogRepositoriesFactory;
  /** Fuso da rede, usado no filtro por dia. */
  timezone: string;
}
