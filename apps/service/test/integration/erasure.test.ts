import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '../../src/events.js';
import { repos } from '../../src/repo/index.js';
import { appOver } from '../support/app-call.js';
import { ERASURE_SECRET, startHarness, type Harness } from '../support/harness.js';
import { helloDocument } from '../support/documents.js';
import { pngBytes } from '../support/images.js';

/**
 * auth-brain's `tenant.erased` webhook (POST /internal/erasure): signed like
 * auth-brain signs it (auth-brain packages/app/src/lib/erasure/webhook-signature.ts),
 * erases every workspace of the company, rows and stored images, and nothing
 * else; idempotent by event id.
 */

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h?.drop());

/** The body exactly as auth-brain serialises it: fixed field order, optional fields only when present. */
function erasureBody(event: { event_id: string; kind: string; user_id: string; tenant_id?: string; workspace_ids?: string[] }) {
  return JSON.stringify({
    event_id: event.event_id,
    kind: event.kind,
    user_id: event.user_id,
    ...(event.tenant_id !== undefined ? { tenant_id: event.tenant_id } : {}),
    ...(event.workspace_ids !== undefined ? { workspace_ids: event.workspace_ids } : {}),
    requested_at: '2026-09-18T10:00:00.000Z',
  });
}

const sign = (raw: string, secret = ERASURE_SECRET) => `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;

async function deliver(raw: string, signature: string | null = sign(raw)) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-lumitra-erasure-signature'] = signature;
  const res = await h.app.request('/internal/erasure', { method: 'POST', headers, body: raw });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

/** A workspace created through the dashboard for a company, filled with one of everything. */
async function seedCompanyWorkspace(slug: string, companyId: string | undefined) {
  const owner = `owner-${slug}`;
  const ws = await h.call({
    method: 'POST',
    path: '/v1/workspaces',
    subject: owner,
    body: { slug, name: slug, owner: { email: `${owner}@example.com` }, ...(companyId ? { company_id: companyId } : {}) },
  });
  expect(ws.status, JSON.stringify(ws.body)).toBe(201);
  expect(ws.body.company_id).toBe(companyId ?? null);
  const id = ws.body.id as string;
  const as = { subject: owner, workspace: id };

  const form = new FormData();
  form.append('file', new Blob([pngBytes(10, 10)], { type: 'image/png' }), 'a.png');
  const asset = await h.call({ method: 'POST', path: '/v1/assets', form, ...as });
  expect(asset.status, JSON.stringify(asset.body)).toBe(201);

  const template = await h.call({ method: 'POST', path: '/v1/templates', body: { name: 'T', document: helloDocument() }, ...as });
  expect(template.status).toBe(201);
  const topic = await h.call({ method: 'POST', path: '/v1/topics', body: { slug: 'news', name: 'News' }, ...as });
  expect(topic.status).toBe(201);
  const provider = await h.call({
    method: 'POST',
    path: '/v1/providers',
    ...as,
    body: {
      kind: 'smtp',
      name: 'SMTP',
      config: { host: 'smtp.example.com', port: 465, security: 'tls', username: 'u', password: 'p' },
      from_name: 'News',
      from_email: 'news@example.com',
      reply_to: null,
      policy: { daily_recipient_budget: 100, min_interval_ms: 0, max_recipients_per_message: 1 },
    },
  });
  expect(provider.status, JSON.stringify(provider.body)).toBe(201);
  const contact = await h.call({ method: 'POST', path: '/v1/contacts', body: { email: `person@${slug}.io` }, ...as });
  expect(contact.status).toBeLessThan(300);
  const suppression = await h.call({ method: 'POST', path: '/v1/suppressions', body: { email: `blocked@${slug}.io`, reason: 'manual' }, ...as });
  expect(suppression.status).toBeLessThan(300);

  // Mailings, recipients and archived messages: written through the
  // repositories, since those routes arrive with the worker.
  const r = repos(h.sql);
  const mailing = await r.mailings.create(id, {
    name: null,
    subject: 'Hi',
    preheader: null,
    templateId: template.body.id,
    document: helloDocument(),
    topicId: topic.body.id,
    providerId: provider.body.id,
    metadata: {},
    createdBy: { type: 'system', reason: 'test' },
  });
  await r.recipients.addMany(id, mailing.id, [{ email: `person@${slug}.io`, contactId: contact.body.contact.id, merge: {} }]);
  await r.messages.insert(id, {
    mailingId: mailing.id,
    recipientId: null,
    contactId: contact.body.contact.id,
    to: `person@${slug}.io`,
    subject: 'Hi',
    html: '<p>Hi</p>',
    providerId: provider.body.id,
    providerMessageId: 'pm-1',
    outcome: 'sent',
    error: null,
    isTest: false,
    recipientCount: 1,
  });
  // A webhook endpoint with one pending delivery, so the cascade through the
  // outbox and its composite foreign keys is proven, not assumed.
  await r.webhookEndpoints.create(id, {
    url: 'https://hooks.example.com/mail',
    description: null,
    events: ['mailing.finished'],
    enabled: true,
    secretSealed: h.sealer.seal('whsec_test_secret_value_for_the_erasure_test'),
  });
  await h.sql.begin((tx) =>
    emitEvent(tx, id, {
      type: 'mailing.finished',
      data: {
        mailing_id: mailing.id,
        mailing_metadata: {},
        status: 'sent',
        counts: { total: 1, queued: 0, sending: 0, sent: 1, failed: 0, skipped: 0 },
        finished_at: new Date().toISOString(),
      },
    }),
  );
  return { id, owner, fileCount: 1 };
}

async function rowsOf(workspaceId: string): Promise<number> {
  const tables = ['workspace_members', 'api_keys', 'audit_log', 'templates', 'template_versions', 'assets', 'providers', 'topics', 'contacts', 'suppressions', 'mailings', 'mailing_recipients', 'messages', 'webhook_endpoints', 'webhook_events', 'webhook_deliveries'];
  let total = 0;
  for (const t of tables) {
    const [row] = await h.sql.unsafe(`SELECT count(*)::int AS n FROM ${t} WHERE workspace_id = $1`, [workspaceId]);
    total += row!.n as number;
  }
  const [ws] = await h.sql`SELECT count(*)::int AS n FROM workspaces WHERE id = ${workspaceId}`;
  return total + (ws!.n as number);
}

describe('erasure: tenant.erased', () => {
  it('erases every workspace of the company, rows and stored images, and nothing of another company', async () => {
    const a1 = await seedCompanyWorkspace('erase-a1', 'tenant-a');
    const a2 = await seedCompanyWorkspace('erase-a2', 'tenant-a');
    const b = await seedCompanyWorkspace('erase-b', 'tenant-b');
    const none = await seedCompanyWorkspace('erase-none', undefined);
    const filesBefore = h.storage.files.size;
    expect(await rowsOf(a1.id)).toBeGreaterThan(10);

    const raw = erasureBody({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u-1', tenant_id: 'tenant-a', workspace_ids: ['auth-ws-1'] });
    const res = await deliver(raw);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ok: true, replayed: false, workspaces_erased: 2 });

    expect(await rowsOf(a1.id)).toBe(0);
    expect(await rowsOf(a2.id)).toBe(0);
    expect(await rowsOf(b.id)).toBeGreaterThan(10);
    expect(await rowsOf(none.id)).toBeGreaterThan(10);
    expect(h.storage.files.size).toBe(filesBefore - 2);
    expect([...h.storage.files.values()].some((f) => f.workspaceId === a1.id || f.workspaceId === a2.id)).toBe(false);

    // The erased owners no longer see those workspaces; another company's owner still sees theirs.
    expect((await h.call({ path: '/v1/workspaces', subject: a1.owner })).body.data).toEqual([]);
    expect((await h.call({ path: '/v1/workspaces', subject: b.owner })).body.data).toHaveLength(1);
  });

  it('a redelivery of the same event is a no-op success', async () => {
    await seedCompanyWorkspace('erase-replay', 'tenant-replay');
    const raw = erasureBody({ event_id: 'evt-replay', kind: 'tenant.erased', user_id: 'u-2', tenant_id: 'tenant-replay' });
    expect((await deliver(raw)).body).toEqual({ ok: true, replayed: false, workspaces_erased: 1 });
    expect((await deliver(raw)).body).toEqual({ ok: true, replayed: true, workspaces_erased: 0 });
  });

  it('a company this service never served acks as a no-op, and so does user.erased', async () => {
    const unknown = await deliver(erasureBody({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u', tenant_id: 'never-seen' }));
    expect(unknown).toEqual({ status: 200, body: { ok: true, replayed: false, workspaces_erased: 0 } });
    const user = await deliver(erasureBody({ event_id: randomUUID(), kind: 'user.erased', user_id: 'u' }));
    expect(user).toEqual({ status: 200, body: { ok: true, replayed: false, workspaces_erased: 0 } });
  });

  it('refuses a missing, forged or wrong-secret signature, and erases nothing', async () => {
    const w = await seedCompanyWorkspace('erase-forged', 'tenant-forged');
    const raw = erasureBody({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u', tenant_id: 'tenant-forged' });
    expect((await deliver(raw, null)).status).toBe(401);
    expect((await deliver(raw, sign(raw, 'wrong'.repeat(10)))).status).toBe(401);
    expect((await deliver(raw, 'sha256=00')).status).toBe(401);
    // A body altered after signing.
    expect((await deliver(raw.replace('tenant-forged', 'tenant-other'), sign(raw))).status).toBe(401);
    expect(await rowsOf(w.id)).toBeGreaterThan(10);
  });

  it('refuses a signed body that is not an erasure event', async () => {
    expect((await deliver('not json')).status).toBe(400);
    expect((await deliver(JSON.stringify({ kind: 'tenant.erased' }))).body.error.code).toBe('validation_failed');
    const noTenant = erasureBody({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u' });
    expect((await deliver(noTenant)).body.error.code).toBe('validation_failed');
  });

  it('when Storage Brain fails, answers 503, erases nothing and records nothing, so the redelivery completes it', async () => {
    const w = await seedCompanyWorkspace('erase-retry', 'tenant-retry');
    const raw = erasureBody({ event_id: 'evt-retry', kind: 'tenant.erased', user_id: 'u', tenant_id: 'tenant-retry' });
    const original = h.storage.remove.bind(h.storage);
    h.storage.remove = async () => {
      const { AssetStorageUnavailable } = await import('../../src/assets/storage.js');
      throw new AssetStorageUnavailable('down');
    };
    try {
      const res = await deliver(raw);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('service_unavailable');
    } finally {
      h.storage.remove = original;
    }
    expect(await rowsOf(w.id)).toBeGreaterThan(10);
    expect((await deliver(raw)).body).toEqual({ ok: true, replayed: false, workspaces_erased: 1 });
    expect(await rowsOf(w.id)).toBe(0);
  });

  it('without a configured secret answers 503 (retryable) and erases nothing', async () => {
    const w = await seedCompanyWorkspace('erase-unconfigured', 'tenant-unconfigured');
    const unconfigured = appOver(h); // no erasureWebhookSecret
    const raw = erasureBody({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u', tenant_id: 'tenant-unconfigured' });
    const res = await unconfigured.app.request('/internal/erasure', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lumitra-erasure-signature': sign(raw) },
      body: raw,
    });
    expect(res.status).toBe(503);
    expect(await rowsOf(w.id)).toBeGreaterThan(10);
  });
});
