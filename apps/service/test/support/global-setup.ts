import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * One Postgres for the whole run. Each integration file creates and drops its
 * own database on it (test/support/db.ts), so files never see each other's rows.
 *
 * - TEST_DATABASE_URL set (CI, with a Postgres service container): use it.
 * - Otherwise start postgres:17-alpine with Testcontainers. On this machine that
 *   needs DOCKER_HOST=unix://$HOME/.colima/default/docker.sock and
 *   TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock (the socket path
 *   inside the Colima VM, which the Ryuk reaper container mounts).
 *
 * If neither works, the run FAILS, naming the fix. It never skips: a suite that
 * silently skips its tenancy tests is worse than one that does not exist.
 */
let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) {
    process.env.TEST_PG_ADMIN_URL = process.env.TEST_DATABASE_URL;
    return;
  }
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (err) {
    throw new Error(
      'Integration tests need Postgres: set TEST_DATABASE_URL, or make Docker reachable for Testcontainers ' +
        '(on macOS with Colima: DOCKER_HOST=unix://$HOME/.colima/default/docker.sock and ' +
        'TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock). Cause: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  process.env.TEST_PG_ADMIN_URL = container.getConnectionUri();
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
