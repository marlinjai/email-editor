import { ICLOUD_SMTP_POLICY, type Provider, type ProviderPolicy, type ProviderVerifyResult } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { ledgerBudget } from '../budget.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { policyOf, type ProviderRow } from '../repo/providers.js';
import type { SmtpSettings } from '../transport/smtp.js';
import { SendError, type Transport } from '../transport/types.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';
import { assertWithinLimit } from '../billing/usage.js';

export type ProviderRouteOptions = {
  /** Builds the SMTP transport `verify` connects through; `createSmtpTransport` in production. */
  smtpTransport: (settings: SmtpSettings) => Transport;
  /** How long `verify` waits for the provider before it reports the host unreachable. */
  verifyTimeoutMs: number;
  /** The HTTP client `verify` checks a Resend key with. */
  fetch: typeof fetch;
};

export const RESEND_API_URL = 'https://api.resend.com';

/** Apple's published iCloud+ custom-domain limits, which a stored policy may never exceed. */
const ICLOUD_HOST = 'smtp.mail.me.com';
const ICLOUD_HARD_LIMITS = { daily_recipient_budget: 1000, max_recipients_per_message: 1 } as const;

const SMTP_CONFIG_KEYS = ['host', 'port', 'security', 'username'] as const;

/** Shapes a stored row into the contract's `Provider`: non-secret config only, the policy grouped. */
export function toProvider(row: ProviderRow): Provider {
  const common = {
    id: row.id,
    name: row.name,
    has_secret: row.has_secret,
    from_name: row.from_name,
    from_email: row.from_email,
    reply_to: row.reply_to,
    policy: policyOf(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.kind === 'smtp') {
    const c = row.config as Record<string, unknown>;
    return {
      ...common,
      kind: 'smtp',
      config: {
        host: String(c.host),
        port: Number(c.port),
        security: c.security as 'tls' | 'starttls',
        username: String(c.username),
      },
    };
  }
  return { ...common, kind: 'resend', config: {} };
}

/** Only the non-secret settings are stored in `config`; the secret is sealed apart. */
function smtpConfigWithoutSecret(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SMTP_CONFIG_KEYS) if (config[k] !== undefined) out[k] = config[k];
  return out;
}

/**
 * iCloud+ refuses more than 1,000 recipients a day and suspends accounts that
 * push it, so a provider on its host may not be configured above that.
 */
function checkIcloudPolicy(host: unknown, policy: ProviderPolicy): void {
  if (typeof host !== 'string' || host.trim().toLowerCase() !== ICLOUD_HOST) return;
  const issues: Array<{ path: string[]; message: string }> = [];
  if (policy.daily_recipient_budget > ICLOUD_HARD_LIMITS.daily_recipient_budget) {
    issues.push({
      path: ['policy', 'daily_recipient_budget'],
      message: `iCloud+ allows at most ${ICLOUD_HARD_LIMITS.daily_recipient_budget} recipients a day`,
    });
  }
  if (policy.max_recipients_per_message > ICLOUD_HARD_LIMITS.max_recipients_per_message) {
    issues.push({ path: ['policy', 'max_recipients_per_message'], message: 'broadcasts through iCloud+ send one recipient per message' });
  }
  if (issues.length > 0) {
    throw new ApiError('validation_failed', `The policy exceeds the limits of ${ICLOUD_HOST}. Use ICLOUD_SMTP_POLICY or lower.`, {
      issues,
      recommended_policy: ICLOUD_SMTP_POLICY,
    });
  }
}

/**
 * The typed outcome of a failed `verify`. `error` in the response starts with
 * one of these codes, followed by a sentence for humans. It never carries the
 * provider's raw reply, which can echo the credentials back.
 */
export type VerifyFailure = 'auth_failed' | 'tls_failed' | 'host_unreachable' | 'no_secret' | 'provider_rejected';

function failure(code: VerifyFailure, sentence: string): ProviderVerifyResult {
  return { ok: false, error: `${code}: ${sentence}` };
}

const TLS_PATTERN = /certificate|tls|ssl|self[- ]signed|handshake|wrong version number|EPROTO|alert/i;
const UNREACHABLE_PATTERN = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|ECONNRESET|timeout|socket closed|connection closed/i;

/** Maps what the SMTP transport threw during `verify` onto the typed failures. */
export function classifyVerifyError(err: unknown): ProviderVerifyResult {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof SendError ? err.code : null;
  if ((err instanceof SendError && err.kind === 'permanent' && /^authentication failed/i.test(message)) || code === 535 || code === 534) {
    return failure('auth_failed', 'The server refused the username or password.');
  }
  if (TLS_PATTERN.test(message)) {
    return failure('tls_failed', 'An encrypted connection could not be established. Check the port and the security setting (tls on 465, starttls on 587).');
  }
  if (UNREACHABLE_PATTERN.test(message)) {
    return failure('host_unreachable', 'The server could not be reached. Check the host and the port.');
  }
  return failure('provider_rejected', `The server refused the connection${code ? ` (reply ${code})` : ''}.`);
}

class VerifyTimeout extends Error {}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new VerifyTimeout()), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function verifySmtp(opts: ProviderRouteOptions, config: Record<string, unknown>, password: string): Promise<ProviderVerifyResult> {
  const transport = opts.smtpTransport({
    host: String(config.host),
    port: Number(config.port),
    security: config.security as 'tls' | 'starttls',
    username: String(config.username),
    password,
  });
  try {
    await withTimeout(transport.verify(), opts.verifyTimeoutMs);
    return { ok: true, error: null };
  } catch (err) {
    if (err instanceof VerifyTimeout) {
      return failure('host_unreachable', `The server did not answer within ${Math.round(opts.verifyTimeoutMs / 1000)} seconds.`);
    }
    return classifyVerifyError(err);
  } finally {
    await transport.close().catch(() => {});
  }
}

/**
 * Checks a Resend key with a read that needs no side effect. A key restricted to
 * sending is valid but may not list domains: Resend answers 401 with
 * `restricted_api_key` for it, which counts as verified.
 */
async function verifyResend(opts: ProviderRouteOptions, apiKey: string): Promise<ProviderVerifyResult> {
  let res: Response;
  try {
    res = await opts.fetch(`${RESEND_API_URL}/domains`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(opts.verifyTimeoutMs),
    });
  } catch {
    return failure('host_unreachable', 'The Resend API could not be reached.');
  }
  if (res.ok) return { ok: true, error: null };
  let name = '';
  try {
    name = String(((await res.json()) as { name?: unknown }).name ?? '');
  } catch {
    // A non-JSON error body: the status alone decides.
  }
  if (res.status === 401 && name === 'restricted_api_key') return { ok: true, error: null };
  if (res.status === 401 || res.status === 403) return failure('auth_failed', 'Resend refused the API key.');
  return failure('provider_rejected', `Resend answered with status ${res.status}.`);
}

export function providerRoutes(sql: Sql, deps: MountDeps, opts: ProviderRouteOptions) {
  const app = new Hono<AppEnv>();
  const { pool, sealer } = deps;

  mount(app, 'providers.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'providers.list');
    const page = await pageArgs(q, async (id) => (await pool.providers.get(workspaceId, id)) !== null);
    const rows = await pool.providers.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    const { data, next_cursor } = toPage(rows, page.limit);
    return c.json({ data: data.map(toProvider), next_cursor });
  });

  // The secret arrives here and leaves only sealed: never in the response, the
  // audit row or a log line.
  mount(app, 'providers.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'providers.create');
    let config: Record<string, unknown>;
    let secret: string;
    if (input.kind === 'smtp') {
      const { password, ...rest } = input.config;
      secret = password;
      config = smtpConfigWithoutSecret(rest);
      config.host = String(config.host).trim().toLowerCase();
      checkIcloudPolicy(config.host, input.policy);
    } else {
      secret = input.config.api_key;
      config = {};
    }
    const row = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.providers.create(access.workspaceId, {
        kind: input.kind,
        name: input.name,
        config,
        secretSealed: sealer.seal(secret),
        fromName: input.from_name,
        fromEmail: input.from_email,
        replyTo: input.reply_to,
        policy: input.policy,
      });
      await assertWithinLimit(tx, access.workspaceId, 'providers');
      await r.audit.record(access.workspaceId, {
        action: 'provider.created',
        actor: actorOf(access),
        targetType: 'provider',
        targetId: created.id,
        details: { name: created.name, kind: created.kind, has_secret: created.has_secret },
      });
      return created;
    });
    c.header('cache-control', 'no-store');
    return c.json(toProvider(row), 201);
  });

  mount(app, 'providers.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'providers.get').id, 'provider');
    const row = await pool.providers.get(workspaceId, id);
    if (!row) throw new ApiError('not_found', 'No such provider in this workspace.');
    return c.json(toProvider(row));
  });

  mount(app, 'providers.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'providers.update').id, 'provider');
    const input = await body(c, 'providers.update');
    const row = await sql.begin(async (tx) => {
      const r = repos(tx);
      const existing = await r.providers.lock(access.workspaceId, id);
      if (!existing || (await r.providers.get(access.workspaceId, id)) === null) {
        throw new ApiError('not_found', 'No such provider in this workspace.');
      }
      if (existing.kind !== input.kind) {
        throw new ApiError('validation_failed', `A provider's kind cannot change; create a new ${input.kind} provider instead.`, {
          issues: [{ path: ['kind'], message: `this provider is ${existing.kind}` }],
        });
      }
      let config: Record<string, unknown> | undefined;
      let secret: string | undefined;
      if (input.kind === 'smtp' && input.config) {
        const { password, ...rest } = input.config;
        secret = password;
        config = smtpConfigWithoutSecret(rest);
        if (typeof config.host === 'string') config.host = config.host.trim().toLowerCase();
        if (Object.keys(config).length === 0) config = undefined;
      } else if (input.kind === 'resend' && input.config) {
        secret = input.config.api_key;
      }
      const policy = { ...policyOf(existing), ...(input.policy ?? {}) };
      if (existing.kind === 'smtp') checkIcloudPolicy(config?.host ?? existing.config.host, policy);

      const updated = await r.providers.update(access.workspaceId, id, {
        name: input.name,
        config,
        secretSealed: secret === undefined ? undefined : sealer.seal(secret),
        fromName: input.from_name,
        fromEmail: input.from_email,
        replyTo: input.reply_to,
        policy: input.policy,
      });
      if (!updated) throw new ApiError('not_found', 'No such provider in this workspace.');
      // Which fields changed, never their values: the config may name a username
      // and the secret must never be written anywhere but sealed.
      const fields = [
        ...(['name', 'from_name', 'from_email', 'reply_to'] as const).filter((k) => input[k] !== undefined),
        ...Object.keys(config ?? {}).map((k) => `config.${k}`),
        ...Object.keys(input.policy ?? {}).map((k) => `policy.${k}`),
      ];
      await r.audit.record(access.workspaceId, {
        action: 'provider.updated',
        actor: actorOf(access),
        targetType: 'provider',
        targetId: id,
        details: { fields, secret_rotated: secret !== undefined },
      });
      return updated;
    });
    c.header('cache-control', 'no-store');
    return c.json(toProvider(row));
  });

  // Soft delete, refused while a mailing still needs the provider to send.
  mount(app, 'providers.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'providers.delete').id, 'provider');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const existing = await r.providers.lock(access.workspaceId, id);
      if (!existing || (await r.providers.get(access.workspaceId, id)) === null) {
        throw new ApiError('not_found', 'No such provider in this workspace.');
      }
      const active = await r.mailings.countActiveForProvider(access.workspaceId, id);
      if (active > 0) {
        throw new ApiError('conflict', 'The provider is used by a mailing that is scheduled, sending or paused. Finish or cancel it first.', {
          active_mailings: active,
        });
      }
      await r.providers.softDelete(access.workspaceId, id);
      await r.audit.record(access.workspaceId, {
        action: 'provider.deleted',
        actor: actorOf(access),
        targetType: 'provider',
        targetId: id,
        details: { name: existing.name, kind: existing.kind },
      });
    });
    return c.json({ ok: true as const });
  });

  // Connects with the stored credentials, sends nothing. A failed check is a
  // normal answer (200, ok false, a typed error), not an API error.
  mount(app, 'providers.verify', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'providers.verify').id, 'provider');
    if ((await pool.providers.get(workspaceId, id)) === null) throw new ApiError('not_found', 'No such provider in this workspace.');
    const provider = await pool.providers.getForSend(workspaceId, id);
    if (!provider) throw new ApiError('not_found', 'No such provider in this workspace.');
    if (!provider.secret_sealed) return c.json(failure('no_secret', 'No credential is stored for this provider.'));
    const secret = sealer.open(provider.secret_sealed);
    const result = provider.kind === 'smtp' ? await verifySmtp(opts, provider.config, secret) : await verifyResend(opts, secret);
    return c.json(result);
  });

  mount(app, 'providers.usage', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'providers.usage').id, 'provider');
    if ((await pool.providers.get(workspaceId, id)) === null) throw new ApiError('not_found', 'No such provider in this workspace.');
    return c.json(await ledgerBudget.usage(sql, workspaceId, id));
  });

  return app;
}
