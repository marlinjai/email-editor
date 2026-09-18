import { MAX_ASSET_BYTES, REQUEST_ID_HEADER, routes } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AssetStorage } from './assets/storage.js';
import { authenticate } from './auth.js';
import type { Compiler } from './compile/pool.js';
import type { AppEnv } from './context.js';
import type { Sql } from './db.js';
import { ApiError } from './api-error.js';
import { repos } from './repo/index.js';
import { createSealer, type SecretsKeys } from './sealing.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { assetRoutes, publicAssetRoutes } from './routes/assets.js';
import { auditRoutes } from './routes/audit.js';
import { erasureRoutes } from './routes/erasure.js';
import { healthRoutes } from './routes/health.js';
import { memberRoutes } from './routes/members.js';
import { templateRoutes } from './routes/templates.js';
import { webhookRoutes } from './routes/webhooks.js';
import { workspaceRoutes } from './routes/workspaces.js';
import type { SsrfPolicy } from './webhooks/ssrf.js';
import { providerRoutes } from './routes/providers.js';
import { contactRoutes } from './routes/contacts.js';
import { suppressionRoutes } from './routes/suppressions.js';
import { topicRoutes } from './routes/topics.js';
import { createSmtpTransport, type SmtpSettings } from './transport/smtp.js';
import type { Transport } from './transport/types.js';

export const MAX_BODY_BYTES = 1024 * 1024;
/** An image upload: the file itself plus room for the multipart framing around it. */
export const MAX_UPLOAD_BODY_BYTES = MAX_ASSET_BYTES + 64 * 1024;

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
  /** Compiles documents off the request thread (a CompilePool in production). */
  compiler: Compiler;
  /** Where uploaded images are stored (Storage Brain in production). */
  assetStorage: AssetStorage;
  /** The service's public origin, without a trailing slash; asset URLs are built on it. */
  publicBaseUrl: string;
  log?: Pick<Console, 'error'>;
  /** F1: the SMTP transport `providers.verify` connects through (a test points it at a local server). */
  smtpTransport?: (settings: SmtpSettings) => Transport;
  /** F1: how long `providers.verify` waits for a provider. */
  providerVerifyTimeoutMs?: number;
  /** F1: the HTTP client `providers.verify` checks a Resend key with. */
  providerFetch?: typeof fetch;
  /**
   * S3: the HMAC secret auth-brain signs its erasure webhook with
   * (MAIL_ERASURE_WEBHOOK_SECRET). Without it `/internal/erasure` answers 503.
   */
  erasureWebhookSecret?: string;
};

export function createApp({
  sql,
  dashboardServiceToken,
  secretsKeys,
  webhookUrlPolicy,
  compiler,
  assetStorage,
  publicBaseUrl,
  log = console,
  smtpTransport = createSmtpTransport,
  providerVerifyTimeoutMs = 10_000,
  providerFetch = fetch,
  erasureWebhookSecret,
}: AppOptions) {
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
  app.route('/', publicAssetRoutes({ pool, storage: assetStorage, log }));
  app.route('/', erasureRoutes(sql, { secret: erasureWebhookSecret, storage: assetStorage, log: { error: log.error, log: console.log } }));

  const limit = (maxSize: number) =>
    bodyLimit({
      maxSize,
      onError: () => {
        throw new ApiError('payload_too_large', `The request body is larger than ${maxSize} bytes.`, { limit_bytes: maxSize });
      },
    });
  const jsonLimit = limit(MAX_BODY_BYTES);
  const uploadLimit = limit(MAX_UPLOAD_BODY_BYTES);
  const upload = routes['assets.upload'];
  app.use('/v1/*', (c, next) =>
    c.req.method === upload.method && c.req.path === upload.path ? uploadLimit(c, next) : jsonLimit(c, next),
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
  app.route('/', templateRoutes(sql, { ...deps, compiler }));
  app.route('/', assetRoutes(sql, { ...deps, storage: assetStorage, publicBaseUrl, log }));
  app.route('/', webhookRoutes(sql, deps, webhookUrlPolicy));
  app.route('/', providerRoutes(sql, deps, { smtpTransport, verifyTimeoutMs: providerVerifyTimeoutMs, fetch: providerFetch }));
  app.route('/', topicRoutes(sql, deps));
  app.route('/', contactRoutes(sql, deps));
  app.route('/', suppressionRoutes(sql, deps));

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
