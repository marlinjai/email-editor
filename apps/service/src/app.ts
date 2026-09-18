import { REQUEST_ID_HEADER } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authenticate } from './auth.js';
import type { AppEnv } from './context.js';
import type { Sql } from './db.js';
import { ApiError } from './api-error.js';
import { repos } from './repo/index.js';
import { createSealer, type SecretsKeys } from './sealing.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { auditRoutes } from './routes/audit.js';
import { healthRoutes } from './routes/health.js';
import { memberRoutes } from './routes/members.js';
import { webhookRoutes } from './routes/webhooks.js';
import { workspaceRoutes } from './routes/workspaces.js';
import type { SsrfPolicy } from './webhooks/ssrf.js';

export const MAX_BODY_BYTES = 1024 * 1024;

export type AppOptions = {
  sql: Sql;
  dashboardServiceToken: string;
  /** MAIL_SECRETS_KEY by version; seals what the service stores at rest. */
  secretsKeys: SecretsKeys;
  /**
   * Overrides the webhook endpoint URL policy (https-only, no private
   * targets). Only ever relaxed by an explicit development flag, never in
   * production; the integration tests use it to reach a local receiver.
   */
  webhookUrlPolicy?: SsrfPolicy;
  log?: Pick<Console, 'error'>;
};

export function createApp({ sql, dashboardServiceToken, secretsKeys, webhookUrlPolicy, log = console }: AppOptions) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const sealer = createSealer(secretsKeys);

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

  const deps = { pool, sealer };
  app.route('/', workspaceRoutes(sql, deps));
  app.route('/', memberRoutes(sql, deps));
  app.route('/', apiKeyRoutes(sql, deps));
  app.route('/', auditRoutes(deps));
  app.route('/', webhookRoutes(sql, deps, webhookUrlPolicy));

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
