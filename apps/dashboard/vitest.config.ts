import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests: pure modules and server actions with the mail SDK mocked. The
// end-to-end suite (test/e2e, Playwright) is separate and runs against a real
// service.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside a React server build; in these tests the
      // modules run on the server by definition.
      'server-only': path.resolve(import.meta.dirname, 'test/unit/server-only-stub.ts'),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
