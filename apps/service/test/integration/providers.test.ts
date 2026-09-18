// The in-process SMTP server below presents a self-signed certificate. The SMTP
// transport (rightly) has no switch to accept one, so this file, and only this
// file (vitest runs each file in its own worker), trusts any certificate.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createServer, type AddressInfo } from 'node:net';
import { ICLOUD_SMTP_POLICY, routes } from '@marlinjai/mail-contract';
import { generate } from 'selfsigned';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { appOver } from '../support/app-call.js';
import { startHarness, type Harness } from '../support/harness.js';

const PASSWORD = 'Sup3r-Secret-Pa55word-4711';
const RESEND_KEY = 're_Sup3rSecretResendKey4711';
const USER = 'news@example.com';

let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;
let tlsServer: SMTPServer;
let plainServer: SMTPServer;
let tlsPort: number;
let plainPort: number;
let closedPort: number;
const consoleLines: string[] = [];

function listen(server: SMTPServer): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.server.address() as AddressInfo).port)));
}

/** A port nothing listens on: bound once, then released. */
async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

beforeAll(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console);
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, Object.getOwnPropertyNames(a ?? {})))).join(' '));
      original(...args);
    });
  }
  h = await startHarness();
  A = await h.seedWorkspace('prov-a');
  B = await h.seedWorkspace('prov-b');

  const pems = await generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048 });
  const onAuth: ConstructorParameters<typeof SMTPServer>[0]['onAuth'] = (auth, _session, cb) => {
    if (auth.username === USER && auth.password === PASSWORD) return cb(null, { user: auth.username });
    return cb(new Error('Invalid username or password'));
  };
  tlsServer = new SMTPServer({ secure: true, key: pems.private, cert: pems.cert, onAuth, logger: false });
  plainServer = new SMTPServer({ secure: false, disabledCommands: ['STARTTLS'], authOptional: true, logger: false });
  tlsPort = await listen(tlsServer);
  plainPort = await listen(plainServer);
  closedPort = await freePort();
});

afterAll(async () => {
  await new Promise<void>((r) => tlsServer?.close(() => r()));
  await new Promise<void>((r) => plainServer?.close(() => r()));
  await h?.drop();
  vi.restoreAllMocks();
});

const POLICY = { daily_recipient_budget: 500, min_interval_ms: 1000, max_recipients_per_message: 1 };

function smtpBody(port: number, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'smtp',
    name: 'Newsletter SMTP',
    config: { host: '127.0.0.1', port, security: 'tls', username: USER, password: PASSWORD },
    from_name: 'News',
    from_email: 'News@Example.com',
    reply_to: null,
    policy: POLICY,
    ...overrides,
  };
}

async function createSmtp(port: number, overrides: Record<string, unknown> = {}) {
  const res = await h.call({ method: 'POST', path: '/v1/providers', key: A.key, body: smtpBody(port, overrides) });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const verifyApp = () => appOver(h.sql, { providerVerifyTimeoutMs: 3000 });

describe('providers: create, read, update, delete', () => {
  it('stores the secret sealed and returns has_secret instead of it', async () => {
    const created = await createSmtp(tlsPort);
    expect(routes['providers.create'].response.safeParse(created).success).toBe(true);
    expect(created.has_secret).toBe(true);
    expect(created.from_email).toBe('news@example.com');
    expect(created.config).toEqual({ host: '127.0.0.1', port: tlsPort, security: 'tls', username: USER });
    const [row] = await h.sql`SELECT config, secret_sealed FROM providers WHERE id = ${created.id}`;
    expect(JSON.stringify(row!.config)).not.toContain(PASSWORD);
    expect(row!.secret_sealed).toMatch(/^sealed:v1:/);
    expect(row!.secret_sealed).not.toContain(PASSWORD);
  });

  it('reads, lists with a cursor, and refuses a foreign cursor', async () => {
    const p1 = await createSmtp(tlsPort, { name: 'one' });
    const p2 = await createSmtp(tlsPort, { name: 'two' });
    const got = await h.call({ path: `/v1/providers/${p1.id}`, key: A.key });
    expect(got.status).toBe(200);
    expect(got.body.id).toBe(p1.id);
    const first = await h.call({ path: '/v1/providers?limit=1', key: A.key });
    expect(first.body.data).toHaveLength(1);
    expect(first.body.next_cursor).not.toBeNull();
    const all = await h.call({ path: '/v1/providers?limit=100', key: A.key });
    expect(all.body.data.map((p: any) => p.id)).toEqual(expect.arrayContaining([p1.id, p2.id]));
    const foreign = await h.call({ path: `/v1/providers?cursor=${p1.id}`, key: B.key });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('invalid_cursor');
  });

  it('updates fields, rotates the secret, and audits field names only', async () => {
    const p = await createSmtp(tlsPort);
    const res = await h.call({
      method: 'PATCH',
      path: `/v1/providers/${p.id}`,
      key: A.key,
      body: { kind: 'smtp', name: 'Renamed', config: { password: `${PASSWORD}-new`, port: 2465 }, policy: { min_interval_ms: 5000 } },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.config.port).toBe(2465);
    expect(res.body.config.host).toBe('127.0.0.1');
    expect(res.body.policy).toEqual({ ...POLICY, min_interval_ms: 5000 });
    const [entry] = await h.sql`SELECT details FROM audit_log WHERE target_id = ${p.id} AND action = 'provider.updated'`;
    expect(entry!.details).toEqual({ fields: ['name', 'config.port', 'policy.min_interval_ms'], secret_rotated: true });
  });

  it('refuses to change the kind', async () => {
    const p = await createSmtp(tlsPort);
    const res = await h.call({ method: 'PATCH', path: `/v1/providers/${p.id}`, key: A.key, body: { kind: 'resend', name: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('holds an iCloud+ provider to Apple limits, and accepts ICLOUD_SMTP_POLICY', async () => {
    const icloud = { config: { host: 'SMTP.mail.me.com', port: 587, security: 'starttls', username: USER, password: PASSWORD } };
    const over = await h.call({
      method: 'POST',
      path: '/v1/providers',
      key: A.key,
      body: smtpBody(587, { ...icloud, policy: { ...ICLOUD_SMTP_POLICY, daily_recipient_budget: 1001 } }),
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('validation_failed');
    expect(over.body.error.details.recommended_policy).toEqual(ICLOUD_SMTP_POLICY);
    const ok = await createSmtp(587, { ...icloud, policy: ICLOUD_SMTP_POLICY });
    expect(ok.config.host).toBe('smtp.mail.me.com');
    const raise = await h.call({
      method: 'PATCH',
      path: `/v1/providers/${ok.id}`,
      key: A.key,
      body: { kind: 'smtp', policy: { max_recipients_per_message: 50 } },
    });
    expect(raise.status).toBe(400);
    // Moving a generous provider onto iCloud's host is held to the same limits.
    const generous = await createSmtp(tlsPort, { policy: { ...POLICY, daily_recipient_budget: 5000 } });
    const move = await h.call({
      method: 'PATCH',
      path: `/v1/providers/${generous.id}`,
      key: A.key,
      body: { kind: 'smtp', config: { host: 'smtp.mail.me.com' } },
    });
    expect(move.status).toBe(400);
  });

  it('soft-deletes, and refuses while a mailing still needs the provider', async () => {
    const p = await createSmtp(tlsPort);
    const topic = await h.call({ method: 'POST', path: '/v1/topics', key: A.key, body: { slug: 'prov-del', name: 'N' } });
    const mailing = await repos(h.sql).mailings.create(A.id, {
      name: null,
      subject: 'S',
      preheader: null,
      templateId: null,
      document: {},
      topicId: topic.body.id,
      providerId: p.id,
      metadata: {},
      createdBy: { type: 'api_key', api_key_id: A.keyId },
    });
    for (const status of ['scheduled', 'sending', 'paused']) {
      await h.sql`UPDATE mailings SET status = ${status} WHERE id = ${mailing.id}`;
      const refused = await h.call({ method: 'DELETE', path: `/v1/providers/${p.id}`, key: A.key });
      expect(refused.status, status).toBe(409);
      expect(refused.body.error.code).toBe('conflict');
      expect(refused.body.error.details.active_mailings).toBe(1);
    }
    await h.sql`UPDATE mailings SET status = 'sent' WHERE id = ${mailing.id}`;
    const deleted = await h.call({ method: 'DELETE', path: `/v1/providers/${p.id}`, key: A.key });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });
    expect((await h.call({ path: `/v1/providers/${p.id}`, key: A.key })).status).toBe(404);
    const listed = await h.call({ path: '/v1/providers?limit=100', key: A.key });
    expect(listed.body.data.map((x: any) => x.id)).not.toContain(p.id);
    // The row is still there for the mailing and the archive.
    const [row] = await h.sql`SELECT deleted_at FROM providers WHERE id = ${p.id}`;
    expect(row!.deleted_at).not.toBeNull();
    expect((await h.call({ method: 'DELETE', path: `/v1/providers/${p.id}`, key: A.key })).status).toBe(404);
  });

  it('reports usage over the ledger', async () => {
    const p = await createSmtp(tlsPort);
    await repos(h.sql).providerSends.record(A.id, p.id, 3);
    const res = await h.call({ path: `/v1/providers/${p.id}/usage`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ provider_id: p.id, recipients_last_24h: 3, remaining_budget: 497, next_capacity_at: null });
  });
});

describe('providers.verify against a real SMTP server', () => {
  it('succeeds with the right credentials over TLS', async () => {
    const p = await createSmtp(tlsPort);
    const res = await verifyApp().call({ method: 'POST', path: `/v1/providers/${p.id}/verify`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, error: null });
  });

  it('reports auth_failed for a wrong password', async () => {
    const p = await createSmtp(tlsPort, {
      config: { host: '127.0.0.1', port: tlsPort, security: 'tls', username: USER, password: 'wrong-password' },
    });
    const res = await verifyApp().call({ method: 'POST', path: `/v1/providers/${p.id}/verify`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/^auth_failed: /);
  });

  it('reports tls_failed when the server does not speak TLS', async () => {
    const p = await createSmtp(plainPort);
    const res = await verifyApp().call({ method: 'POST', path: `/v1/providers/${p.id}/verify`, key: A.key });
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/^tls_failed: /);
  });

  it('reports host_unreachable when nothing listens', async () => {
    const p = await createSmtp(closedPort);
    const res = await verifyApp().call({ method: 'POST', path: `/v1/providers/${p.id}/verify`, key: A.key });
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/^host_unreachable: /);
  });

  it('reports host_unreachable when the server never answers within the timeout', async () => {
    const silent = createServer(() => {});
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', () => r()));
    const port = (silent.address() as AddressInfo).port;
    try {
      const p = await createSmtp(port);
      const res = await appOver(h.sql, { providerVerifyTimeoutMs: 300 }).call({ method: 'POST', path: `/v1/providers/${p.id}/verify`, key: A.key });
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toMatch(/^host_unreachable: .*within/);
    } finally {
      silent.close();
    }
  });

  it('checks a Resend key over HTTP, counting a sending-only key as valid', async () => {
    const created = await h.call({
      method: 'POST',
      path: '/v1/providers',
      key: A.key,
      body: { kind: 'resend', name: 'Resend', config: { api_key: RESEND_KEY }, from_name: 'N', from_email: 'n@example.com', reply_to: null, policy: POLICY },
    });
    expect(created.status).toBe(201);
    expect(created.body.config).toEqual({});
    const cases: Array<[() => Promise<Response>, RegExp | null]> = [
      [async () => new Response('{"data":[]}', { status: 200 }), null],
      [async () => new Response('{"name":"restricted_api_key"}', { status: 401 }), null],
      [async () => new Response('{"name":"validation_error"}', { status: 401 }), /^auth_failed: /],
      [async () => new Response('oops', { status: 500 }), /^provider_rejected: /],
      [async () => Promise.reject(new TypeError('fetch failed')), /^host_unreachable: /],
    ];
    for (const [answer, expected] of cases) {
      let sentAuth = '';
      const fake = (async (_url: string, init: RequestInit) => {
        sentAuth = String((init.headers as Record<string, string>).authorization);
        return answer();
      }) as unknown as typeof fetch;
      const res = await appOver(h.sql, { providerFetch: fake }).call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: A.key });
      expect(sentAuth).toBe(`Bearer ${RESEND_KEY}`);
      if (expected === null) expect(res.body).toEqual({ ok: true, error: null });
      else expect(res.body.error).toMatch(expected);
    }
  });
});

describe('providers: the secret never leaves sealed', () => {
  it('appears in no response, audit row, idempotency record or log line', async () => {
    const bodies: unknown[] = [];
    const { call, logged } = verifyApp();
    const c = await call({ method: 'POST', path: '/v1/providers', key: A.key, idempotencyKey: 'secret-check', body: smtpBody(tlsPort) });
    bodies.push(c.body);
    bodies.push((await call({ method: 'POST', path: '/v1/providers', key: A.key, idempotencyKey: 'secret-check', body: smtpBody(tlsPort) })).body);
    const id = c.body.id;
    bodies.push((await call({ path: `/v1/providers/${id}`, key: A.key })).body);
    bodies.push((await call({ path: '/v1/providers?limit=100', key: A.key })).body);
    bodies.push((await call({ method: 'PATCH', path: `/v1/providers/${id}`, key: A.key, body: { kind: 'smtp', config: { password: PASSWORD } } })).body);
    bodies.push((await call({ method: 'POST', path: `/v1/providers/${id}/verify`, key: A.key })).body);
    const wrong = await createSmtp(tlsPort, { config: { host: '127.0.0.1', port: tlsPort, security: 'tls', username: USER, password: `${PASSWORD}-x` } });
    bodies.push((await call({ method: 'POST', path: `/v1/providers/${wrong.id}/verify`, key: A.key })).body);
    bodies.push((await call({ path: '/v1/audit-log?limit=100', key: A.key })).body);

    const audit = await h.sql`SELECT details::text AS d FROM audit_log`;
    const idem = await h.sql`SELECT * FROM idempotency_keys`;
    const configs = await h.sql`SELECT config::text AS c FROM providers`;
    for (const haystack of [
      JSON.stringify(bodies),
      JSON.stringify(audit),
      JSON.stringify(idem),
      JSON.stringify(configs),
      JSON.stringify(logged),
      JSON.stringify(h.errors),
      consoleLines.join('\n'),
    ]) {
      expect(haystack).not.toContain(PASSWORD);
    }
  });
});

describe('providers: tenancy', () => {
  it("workspace B cannot read, change, verify, meter or delete A's provider", async () => {
    const p = await createSmtp(tlsPort);
    for (const [method, path, body] of [
      ['GET', `/v1/providers/${p.id}`, undefined],
      ['PATCH', `/v1/providers/${p.id}`, { kind: 'smtp', name: 'stolen' }],
      ['POST', `/v1/providers/${p.id}/verify`, undefined],
      ['GET', `/v1/providers/${p.id}/usage`, undefined],
      ['DELETE', `/v1/providers/${p.id}`, undefined],
    ] as const) {
      const res = await h.call({ method, path, key: B.key, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const listed = await h.call({ path: '/v1/providers?limit=100', key: B.key });
    expect(listed.body.data.map((x: any) => x.id)).not.toContain(p.id);
    expect((await h.call({ path: `/v1/providers/${p.id}`, key: A.key })).body.name).toBe('Newsletter SMTP');
  });

  it('a revoked key is refused, and a send-scoped key cannot administer providers', async () => {
    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${minted.body.api_key.id}`, key: A.key });
    const revoked = await h.call({ path: '/v1/providers', key: minted.body.key });
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('api_key_revoked');
    const send = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'send', scope: 'send' } });
    const denied = await h.call({ method: 'POST', path: '/v1/providers', key: send.body.key, body: smtpBody(tlsPort) });
    expect(denied.status).toBe(403);
  });
});
