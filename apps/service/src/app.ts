import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authenticate } from './auth.js';
import type { AppEnv } from './context.js';
import type { Sql } from './db.js';
import { ApiError } from './errors.js';
import { repos } from './repo/index.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { auditRoutes } from './routes/audit.js';
import { healthRoutes } from './routes/health.js';
import { memberRoutes } from './routes/members.js';
import { workspaceRoutes } from './routes/workspaces.js';

export const REQUEST_ID_HEADER = 'x-request-id';
export const MAX_BODY_BYTES = 1024 * 1024;

export type AppOptions = {
  sql: Sql;
  dashboardServiceToken: string;
  log?: Pick<Console, 'error'>;
};

export function createApp({ sql, dashboardServiceToken, log = console }: AppOptions) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);

  app.use('*', async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const requestId = incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    c.set('requestId', requestId);
    c.header(REQUEST_ID_HEADER, requestId);
    await next();
  });

  app.route('/', healthRoutes(sql));

  app.use(
    '/v1/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new ApiError('payload_too_large', `The request body is larger than ${MAX_BODY_BYTES} bytes.`);
      },
    }),
  );
  app.use(
    '/v1/*',
    authenticate({
      dashboardServiceToken,
      findCredentialByHash: (hash) => pool.apiKeys.findCredentialByHash(hash),
      touchApiKey: (ws, id) => pool.apiKeys.touch(ws, id),
      findMember: (ws, subject) => pool.members.bySubject(ws, subject),
    }),
  );

  app.route('/', workspaceRoutes(sql));
  app.route('/', memberRoutes(sql));
  app.route('/', apiKeyRoutes(sql));
  app.route('/', auditRoutes(sql));

  app.notFound((c) => c.json(new ApiError('not_found', `No route for ${c.req.method} ${c.req.path}.`).toBody(), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.toBody(), err.status as 400);
    }
    // Anything else is our fault. Log it with the request id the client also
    // sees, and tell the client only that it happened.
    log.error(`[${c.get('requestId')}] ${c.req.method} ${c.req.path} failed:`, err);
    return c.json(
      new ApiError('internal_error', 'Something went wrong on our side.', { request_id: c.get('requestId') }).toBody(),
      500,
    );
  });

  return app;
}
