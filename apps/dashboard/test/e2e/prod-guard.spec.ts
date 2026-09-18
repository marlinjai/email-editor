import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/*
 * The end-to-end sign-in bypass must be impossible in production. Both ways a
 * production dashboard starts (`next start`, and the standalone server the
 * container runs) are started here with the flag set, and must exit non-zero
 * before serving anything. Needs `next build` first (CI builds before e2e).
 */

const APP = path.resolve(import.meta.dirname, '../..');

function exitOf(command: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: APP, env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

test('`next start` refuses to start with the bypass flag', async () => {
  expect(existsSync(path.join(APP, '.next/BUILD_ID')), 'run `next build` before this suite').toBe(true);
  const { code, output } = await exitOf(process.execPath, [path.join(APP, 'node_modules/next/dist/bin/next'), 'start', '--port', '3941'], {
    MAIL_DASHBOARD_TEST_AUTH: '1',
  });
  expect(code).not.toBe(0);
  expect(output).toContain('Refusing to start');
});

test('the standalone server (the container) refuses to start with the bypass flag', async () => {
  const server = path.join(APP, '.next/standalone/apps/dashboard/server.js');
  expect(existsSync(server), 'run `next build` before this suite').toBe(true);
  const { code, output } = await exitOf(process.execPath, [server], { MAIL_DASHBOARD_TEST_AUTH: '1', PORT: '3942', NODE_ENV: 'production' });
  expect(code).not.toBe(0);
  expect(output).toContain('Refusing to start');
});

test('without the flag, a production server ignores a forged identity cookie', async ({ request }) => {
  const server = path.join(APP, '.next/standalone/apps/dashboard/server.js');
  const child = spawn(process.execPath, [server], { cwd: APP, env: { PATH: process.env.PATH ?? '', PORT: '3943', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' } as NodeJS.ProcessEnv });
  try {
    await expect.poll(async () => (await request.get('http://127.0.0.1:3943/sign-in').catch(() => null))?.status() ?? 0, { timeout: 30_000 }).toBe(200);
    // The test route is unreachable in production: the gate answers an API
    // call without a session with 401, and the route itself would answer 404.
    const setter = await request.post('http://127.0.0.1:3943/api/test-auth/sign-in', { data: { subject: 's', email: 'a@b.co', name: null, companies: [] } });
    expect([401, 404]).toContain(setter.status());
    expect(setter.headers()['set-cookie'] ?? '').not.toContain('mail_test_identity');
    // A hand-made identity cookie opens nothing: the gate sends the visitor to sign in.
    const forged = Buffer.from(JSON.stringify({ subject: 's', email: 'a@b.co', name: null, companies: [] })).toString('base64url');
    const res = await request.get('http://127.0.0.1:3943/', { headers: { cookie: `mail_test_identity=${forged}` }, maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers().location ?? '').toMatch(/sign-in|auth/);
  } finally {
    child.kill('SIGTERM');
  }
});
