import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Playwright e2e specs run via `make e2e`, never under vitest
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
    // The on-disk transform cache misses new files matched by import.meta.glob
    // (a new cheatsheet), so tests ran against the old bundled set
    experimental: { fsModuleCache: false },
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
    },
  },
});
