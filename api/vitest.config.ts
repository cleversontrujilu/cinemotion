import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integração sobe um PostgreSQL 18 no Docker; o primeiro pull da imagem demora.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
