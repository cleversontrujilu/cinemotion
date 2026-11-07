import { readFileSync } from 'node:fs';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createAdminApp } from '../../../src/apps/admin.js';
import { BASE_PATH } from '../../../src/apps/create-app.js';
import { createCustomerApp } from '../../../src/apps/customer.js';

/**
 * O docs/swagger.yaml é escrito à mão. Este teste garante que ele não se afasta das
 * rotas montadas no Express: rota nova sem documentação, ou documentação de rota
 * removida, quebra aqui.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
}

const deps = { pool: {} as Pool, auth: { secret: 'x'.repeat(32), ttlSeconds: 60 } };

/** "GET /admin/sessions/{id}" para cada rota do router da API. */
function routesOf(app: Express, basePath: string): string[] {
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  const router = stack.find((layer) => layer.handle.stack);
  return (router?.handle.stack ?? []).flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map(
          (method) => `${method.toUpperCase()} ${basePath}${layer.route!.path.replace(/:(\w+)/g, '{$1}')}`,
        )
      : [],
  );
}

function documentedRoutes(): string[] {
  const spec = parse(readFileSync(new URL('../../../../docs/swagger.yaml', import.meta.url), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => method in item).map((method) => `${method.toUpperCase()} ${path}`),
  );
}

describe('docs/swagger.yaml', () => {
  it('documenta exatamente as rotas das duas APIs', () => {
    const code = [
      ...routesOf(createCustomerApp(deps), BASE_PATH.customer),
      ...routesOf(createAdminApp(deps), BASE_PATH.admin),
    ].sort();

    expect(code.length).toBeGreaterThan(0);
    expect(documentedRoutes().sort()).toEqual(code);
  });
});
