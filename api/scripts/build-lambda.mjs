// Gera o artefato único das duas Lambdas: dist/lambda/{customer,admin}.mjs (+ chunks
// compartilhados). O OpenTofu zipa a pasta e cria uma função por handler
// (`customer.handler` / `admin.handler`).
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = 'dist/lambda';

await rm(outdir, { recursive: true, force: true });

await build({
  entryPoints: { customer: 'src/handlers/customer.ts', admin: 'src/handlers/admin.ts' },
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  minify: true,
  sourcemap: 'linked',
  legalComments: 'none',
  // Dependência opcional do `pg`, nunca instalada.
  external: ['pg-native'],
  // Dependências CommonJS empacotadas em ESM ainda chamam `require` para módulos nativos do Node.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
