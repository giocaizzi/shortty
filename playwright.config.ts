import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real built Electron app (see docs/e2e.md).
// Run through `make e2e`, which builds first.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // One app at a time: the launcher hides on blur, so parallel windows
  // would steal focus from each other.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
});
