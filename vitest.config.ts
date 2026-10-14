import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Playwright e2e specs run via `make e2e`, never under vitest
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
    },
  },
});
