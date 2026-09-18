import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { ConfigError, loadConfig, loadMigrateConfig } from './config.js';
import { createSql } from './db.js';
import { migrate, MigrationError } from './migrate.js';
import { repos } from './repo/index.js';
import { createSealer } from './sealing.js';
import { createUnsubscribeSigner } from './unsubscribe.js';
import { SendWorker } from './worker/loop.js';
import { createTransportCache } from './worker/transports.js';

/**
 * The service's one entry point, with two commands:
 *
 *   main.js migrate   apply pending migrations, then exit
 *   main.js serve     start the HTTP API (does NOT migrate)
 *
 * The container entrypoint runs `migrate` and only on success `serve`.
 */

const IDEMPOTENCY_PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function runMigrate(): Promise<void> {
  const { databaseUrl } = loadMigrateConfig();
  const sql = createSql(databaseUrl, { max: 1 });
  try {
    await migrate(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runServe(): Promise<void> {
  const config = loadConfig();
  const sql = createSql(config.databaseUrl, { max: config.databasePoolMax });
  const unsubscribeSigner = createUnsubscribeSigner(config.unsubscribeKeys);
  // One transport per provider, shared by the worker and the test sends.
  const transports = createTransportCache(createSealer(config.secretsKeys));
  const app = createApp({
    sql,
    dashboardServiceToken: config.dashboardServiceToken,
    secretsKeys: config.secretsKeys,
    unsubscribeSigner,
    transportFor: transports.get,
  });
  // The send worker: one loop per process. It reconciles what a previous
  // process left mid-send before it claims anything new.
  const worker = new SendWorker({ sql, transportFor: transports.get, signer: unsubscribeSigner });

  const purge = setInterval(() => {
    repos(sql)
      .idempotency.purgeExpired()
      .then((n) => n > 0 && console.log(`[idempotency] purged ${n} expired keys`))
      .catch((err) => console.error('[idempotency] purge failed:', err));
  }, IDEMPOTENCY_PURGE_INTERVAL_MS);
  purge.unref();

  // 0.0.0.0, not the container hostname, so the in-container healthcheck on
  // 127.0.0.1 reaches it.
  const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[serve] listening on http://0.0.0.0:${info.port}`);
  });
  worker.start();

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[serve] ${signal}: draining`);
    clearInterval(purge);
    // The worker finishes the send in flight (and records it) and starts no
    // other; only then do the connections go.
    const workerStopped = worker
      .stop()
      .then(() => transports.closeAll())
      .catch((err) => console.error('[worker] stopping failed:', err));
    server.close(() => {
      workerStopped.finally(() => sql.end({ timeout: 5 }).finally(() => process.exit(0)));
    });
    // Longer than one send's timeout, so an in-flight send is recorded, not cut off.
    setTimeout(() => process.exit(1), 150_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

async function main(argv: string[]): Promise<void> {
  const command = argv[2];
  switch (command) {
    case 'migrate':
      return runMigrate();
    case 'serve':
      return runServe();
    default:
      throw new ConfigError([`unknown command "${command ?? ''}": use "migrate" or "serve"`]);
  }
}

main(process.argv).catch((err) => {
  if (err instanceof ConfigError || err instanceof MigrationError) {
    console.error(`FATAL: ${err.message}`);
  } else {
    console.error('FATAL:', err);
  }
  process.exit(1);
});
