import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Integration files each get their own database, so they may run in parallel;
    // container start-up dominates, hence the generous hook timeout.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
