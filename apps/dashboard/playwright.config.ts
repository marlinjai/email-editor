import { defineConfig, devices } from '@playwright/test';
import { DASHBOARD_TOKEN, PORTS, SERVICE_URL } from './test/e2e/stack';

/**
 * End to end: the real dashboard (next dev, since only a non-production
 * process honours the test sign-in cookie) against the real mail service and
 * worker on Postgres, an SMTP sink and a Storage Brain stand-in (global-setup).
 * One worker, in order: the flows share one database and build on each other.
 */
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './test/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORTS.dashboard}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `pnpm exec next dev --port ${PORTS.dashboard}`,
    url: `http://localhost:${PORTS.dashboard}/sign-in`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    env: {
      MAIL_DASHBOARD_TEST_AUTH: '1',
      MAIL_SERVICE_URL: SERVICE_URL,
      DASHBOARD_SERVICE_TOKEN: DASHBOARD_TOKEN,
      DASHBOARD_PUBLIC_URL: `http://localhost:${PORTS.dashboard}`,
      AUTH_SESSION_SECRET: 'e2e-session-secret-'.padEnd(48, 'x'),
      OIDC_CLIENT_ID: 'e2e-unused',
      OIDC_CLIENT_SECRET: 'e2e-unused',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
