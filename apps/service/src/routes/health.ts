import { Hono } from 'hono';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';

export const HEALTH_DB_TIMEOUT_MS = 2000;

/**
 * Readiness, not just liveness: 200 only when the database answers, so the
 * deploy check (and Coolify's rolling update) can never go green over a service
 * that cannot reach its data.
 */
export function healthRoutes(sql: Sql) {
  const app = new Hono<AppEnv>();
  app.get('/healthz', async (c) => {
    c.header('cache-control', 'no-store');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        sql`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('database did not answer in time')), HEALTH_DB_TIMEOUT_MS);
        }),
      ]);
      return c.json({ ok: true, database: 'up' });
    } catch (err) {
      console.error('[healthz] database check failed:', err instanceof Error ? err.message : err);
      return c.json(
        { ok: false, database: 'down', error: { code: 'service_unavailable', message: 'The database is not reachable.' } },
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  });
  return app;
}
