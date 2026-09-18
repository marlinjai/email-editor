import { defineConfig } from 'vitest/config';

// Unit tests only: no database, so no global Postgres setup.
export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'] },
});
