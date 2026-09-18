import { ICLOUD_SMTP_POLICY, WebhookEvent } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ledgerBudget, UnknownProviderError } from '../../src/budget.js';
import type { Sql } from '../../src/db.js';
import { emitEvent } from '../../src/events.js';
import { migrate } from '../../src/migrate.js';
import { repos } from '../../src/repo/index.js';
import { createSealer } from '../../src/sealing.js';
import { freshDatabase } from '../support/db.js';

/*
 * S2's schema and the seams over it: the constraints that make bad rows
 * impossible (tenancy, sealed secrets, suppression uniqueness with a NULL
 * topic), the repositories the routes and the worker build on, the rolling
 * budget and the event outbox.
 */

let sql: Sql;
let drop: () => Promise<void>;
const sealer = createSealer(new Map([[1, Buffer.alloc(32, 9)]]));
const actor = { type: 'api_key', id: 'k', name: 'test' } as never;

beforeAll(async () => {
  const db = await freshDatabase();
  sql = db.sql;
  drop = db.drop;
  await migrate(sql, { log: () => {} });
});
afterAll(async () => drop());

let n = 0;
async function workspace() {
  const ws = await repos(sql).workspaces.create({
    slug: `ws-${++n}-${Date.now()}`,
    name: 'Test',
    settings: { default_locale: 'en', locales: ['en'], tracking_enabled: false, asset_policy: 'any' },
  });
  return ws!.id;
}

async function provider(ws: string, policy = ICLOUD_SMTP_POLICY) {
  return repos(sql).providers.create(ws, {
    kind: 'smtp',
    name: 'iCloud',
    config: { host: 'smtp.mail.me.com', port: 587, security: 'starttls', username: 'a@example.com' },
    secretSealed: sealer.seal('app-specific-password'),
    fromName: 'Sender',
    fromEmail: 'News@Example.com',
    replyTo: null,
    policy,
  });
}

async function topic(ws: string, slug = 'programme') {
  return (await repos(sql).topics.create(ws, { slug, name: slug, description: null, translations: {} }))!;
}

async function mailing(ws: string) {
  const p = await provider(ws);
  const t = await topic(ws, `topic-${++n}`);
  const m = await repos(sql).mailings.create(ws, {
    name: null,
    subject: 'Hello',
    preheader: null,
    templateId: null,
    document: { version: '1.0' },
    topicId: t.id,
    providerId: p.id,
    metadata: { sent_by: 'someone' },
    createdBy: actor,
  });
  return { m, p, t };
}

describe('providers', () => {
  it('stores the secret sealed and never returns it', async () => {
    const ws = await workspace();
    const p = await provider(ws);
    expect(p.has_secret).toBe(true);
    expect(p).not.toHaveProperty('secret_sealed');
    expect(p.from_email).toBe('news@example.com');
    const forSend = await repos(sql).providers.getForSend(ws, p.id);
    expect(sealer.open(forSend!.secret_sealed!)).toBe('app-specific-password');
  });

  it('refuses a plaintext secret at the database', async () => {
    const ws = await workspace();
    await expect(
      sql`INSERT INTO providers (workspace_id, kind, name, secret_sealed, from_name, from_email,
            daily_recipient_budget, min_interval_ms, max_recipients_per_message)
          VALUES (${ws}, 'smtp', 'x', 'hunter2', 'x', 'x@example.com', 1, 0, 1)`,
    ).rejects.toThrow(/check constraint/);
  });

  it('merges config, keeps the secret unless given, and soft-deletes', async () => {
    const ws = await workspace();
    const p = await provider(ws);
    const updated = await repos(sql).providers.update(ws, p.id, { config: { port: 465, security: 'tls' }, policy: { min_interval_ms: 5000 } });
    expect(updated!.config).toMatchObject({ host: 'smtp.mail.me.com', port: 465, security: 'tls' });
    expect(updated!.min_interval_ms).toBe(5000);
    expect(updated!.daily_recipient_budget).toBe(800);
    expect(updated!.has_secret).toBe(true);
    expect(await repos(sql).providers.softDelete(ws, p.id)).toBe(true);
    expect(await repos(sql).providers.get(ws, p.id)).toBeNull();
    expect(await repos(sql).providers.getForSend(ws, p.id)).not.toBeNull();
    expect(await repos(sql).providers.softDelete(ws, p.id)).toBe(false);
  });

  it('is invisible from another workspace', async () => {
    const a = await workspace();
    const b = await workspace();
    const p = await provider(a);
    expect(await repos(sql).providers.get(b, p.id)).toBeNull();
    expect(await repos(sql).providers.update(b, p.id, { name: 'stolen' })).toBeNull();
  });
});

describe('topics and contacts', () => {
  it('keeps topic slugs unique per workspace', async () => {
    const ws = await workspace();
    await topic(ws, 'venue');
    expect(await repos(sql).topics.create(ws, { slug: 'venue', name: 'again', description: null, translations: {} })).toBeNull();
    expect(await topic(await workspace(), 'venue')).not.toBeNull();
  });

  it('lowercases emails and keeps email and external id unique per workspace', async () => {
    const ws = await workspace();
    const r = repos(sql).contacts;
    const c = await r.insert(ws, { email: 'Ana@Example.com', externalId: 'ext-1' });
    expect(c!.email).toBe('ana@example.com');
    expect(await r.insert(ws, { email: 'ana@example.com' })).toBeNull();
    expect(await r.insert(ws, { email: 'other@example.com', externalId: 'ext-1' })).toBeNull();
    // Many contacts without an external id coexist.
    expect(await r.insert(ws, { email: 'b@example.com' })).not.toBeNull();
    expect(await r.insert(ws, { email: 'c@example.com' })).not.toBeNull();
    // The same person may exist in another workspace.
    expect(await r.insert(await workspace(), { email: 'ana@example.com', externalId: 'ext-1' })).not.toBeNull();
    expect((await r.byEmail(ws, 'ANA@example.com'))!.id).toBe(c!.id);
  });

  it('merges properties and removes keys set to null', async () => {
    const ws = await workspace();
    const r = repos(sql).contacts;
    const c = await r.insert(ws, { email: 'p@example.com', properties: { a: 1, b: 2 } });
    const u = await r.update(ws, c!.id, { properties: { b: null, c: 3 }, firstName: 'Pia' });
    expect(u!.properties).toEqual({ a: 1, c: 3 });
    expect(u!.first_name).toBe('Pia');
    expect(u!.external_id).toBeNull();
  });

  it('replaces subscriptions and lists them as slugs', async () => {
    const ws = await workspace();
    const [t1, t2, t3] = [await topic(ws, 'a'), await topic(ws, 'b'), await topic(ws, 'c')];
    const r = repos(sql).contacts;
    const c = (await r.insert(ws, { email: 's@example.com' }))!;
    await r.setSubscriptions(ws, c.id, [t1.id, t2.id]);
    expect((await r.get(ws, c.id))!.topics).toEqual(['a', 'b']);
    await r.setSubscriptions(ws, c.id, [t2.id, t3.id]);
    expect((await r.get(ws, c.id))!.topics).toEqual(['b', 'c']);
    expect(await r.isSubscribed(ws, c.id, t1.id)).toBe(false);
    expect(await r.unsubscribe(ws, c.id, t2.id)).toBe(true);
    expect((await r.list(ws, { limit: 10, topicId: t3.id })).map((x) => x.id)).toEqual([c.id]);
    await r.setSubscriptions(ws, c.id, []);
    expect((await r.get(ws, c.id))!.topics).toEqual([]);
  });

  it('cannot subscribe a contact to another workspace topic', async () => {
    const a = await workspace();
    const b = await workspace();
    const foreign = await topic(b, 'foreign');
    const c = (await repos(sql).contacts.insert(a, { email: 'x@example.com' }))!;
    await expect(repos(sql).contacts.subscribe(a, c.id, foreign.id)).rejects.toThrow(/foreign key/);
  });
});

describe('suppressions', () => {
  it('allows one all-topics block per address (NULL topic is not distinct) beside per-topic blocks', async () => {
    const ws = await workspace();
    const t = await topic(ws, 'news');
    const r = repos(sql).suppressions;
    const all = await r.create(ws, { email: 'X@example.com', reason: 'manual', topicId: null });
    expect(all.created).toBe(true);
    expect(all.suppression.email).toBe('x@example.com');
    const again = await r.create(ws, { email: 'x@example.com', reason: 'unsubscribed', topicId: null });
    expect(again).toMatchObject({ created: false, suppression: { id: all.suppression.id, reason: 'manual' } });
    const perTopic = await r.create(ws, { email: 'x@example.com', reason: 'unsubscribed', topicId: t.id });
    expect(perTopic.created).toBe(true);
    expect(perTopic.suppression.topic).toBe('news');
    expect((await r.create(ws, { email: 'x@example.com', reason: 'manual', topicId: t.id })).created).toBe(false);
    await expect(
      sql`INSERT INTO suppressions (workspace_id, email, reason) VALUES (${ws}, 'x@example.com', 'manual')`,
    ).rejects.toThrow(/suppressions_unique_block/);
    expect(await r.countForEmail(ws, 'x@example.com')).toBe(2);
  });

  it('finds the block that stops a send: every topic, or this topic, not another', async () => {
    const ws = await workspace();
    const [news, venue] = [await topic(ws, 'news'), await topic(ws, 'venue')];
    const r = repos(sql).suppressions;
    await r.create(ws, { email: 'y@example.com', reason: 'unsubscribed', topicId: news.id });
    expect((await r.findBlocking(ws, 'y@example.com', news.id))!.topic).toBe('news');
    expect(await r.findBlocking(ws, 'y@example.com', venue.id)).toBeNull();
    await r.create(ws, { email: 'y@example.com', reason: 'bounced', topicId: null });
    expect((await r.findBlocking(ws, 'Y@example.com', venue.id))!.reason).toBe('bounced');
    expect(await r.findBlocking(await workspace(), 'y@example.com', venue.id)).toBeNull();
  });

  it('outlives the contact', async () => {
    const ws = await workspace();
    const c = (await repos(sql).contacts.insert(ws, { email: 'gone@example.com' }))!;
    await repos(sql).suppressions.create(ws, { email: 'gone@example.com', reason: 'unsubscribed', topicId: null });
    await repos(sql).contacts.delete(ws, c.id);
    expect(await repos(sql).suppressions.countForEmail(ws, 'gone@example.com')).toBe(1);
  });
});

describe('mailings and recipients', () => {
  it('refuses a provider or topic from another workspace', async () => {
    const a = await workspace();
    const b = await workspace();
    const { p, t } = await mailing(b);
    await expect(
      repos(sql).mailings.create(a, {
        name: null, subject: 's', preheader: null, templateId: null, document: {}, topicId: t.id, providerId: p.id,
        metadata: {}, createdBy: actor,
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it('queues recipients idempotently on the address and counts them live', async () => {
    const ws = await workspace();
    const { m } = await mailing(ws);
    const r = repos(sql).recipients;
    const first = await r.addMany(ws, m.id, [
      { email: 'A@example.com', contactId: null, merge: { first_name: 'A' } },
      { email: 'b@example.com', contactId: null, merge: {} },
    ]);
    expect(first).toEqual({ added: expect.arrayContaining(['a@example.com', 'b@example.com']), alreadyPresent: [] });
    const second = await r.addMany(ws, m.id, [
      { email: 'a@example.com', contactId: null, merge: { first_name: 'changed' } },
      { email: 'c@example.com', contactId: null, merge: {} },
    ]);
    expect(second).toEqual({ added: ['c@example.com'], alreadyPresent: ['a@example.com'] });
    const list = await r.list(ws, m.id, { limit: 10 });
    expect(list.find((x) => x.email === 'a@example.com')!.merge).toEqual({ first_name: 'A' });
    expect(await repos(sql).mailings.counts(ws, m.id)).toEqual({ total: 3, queued: 3, sending: 0, sent: 0, failed: 0, skipped: 0 });
  });

  it('claims each recipient once under concurrency, settles, and requeues failures', async () => {
    const ws = await workspace();
    const { m, p } = await mailing(ws);
    await repos(sql).recipients.addMany(
      ws,
      m.id,
      Array.from({ length: 5 }, (_, i) => ({ email: `r${i}@example.com`, contactId: null, merge: {} })),
    );
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => sql.begin((tx) => repos(tx).recipients.claimNext(ws, m.id))),
    );
    const claimed = claims.filter((c) => c !== null);
    expect(claimed).toHaveLength(5);
    expect(new Set(claimed.map((c) => c!.id)).size).toBe(5);
    expect(claimed.every((c) => c!.status === 'sending' && c!.attempts === 1)).toBe(true);

    const [c0, c1, c2, c3] = claimed as NonNullable<(typeof claimed)[number]>[];
    const msg = await repos(sql).messages.insert(ws, {
      mailingId: m.id, recipientId: c0!.id, contactId: null, to: c0!.email, subject: 'Hello', html: '<p>x</p>',
      providerId: p.id, providerMessageId: 'mem-1', outcome: 'sent', error: null, isTest: false, recipientCount: 1,
    });
    const r = repos(sql).recipients;
    expect((await r.settle(ws, c0!.id, ['sending'], { status: 'sent', messageId: msg.id }))!.status).toBe('sent');
    expect(await r.settle(ws, c0!.id, ['sending'], { status: 'sent', messageId: msg.id })).toBeNull();
    await r.settle(ws, c1!.id, ['sending'], { status: 'failed', messageId: null, error: '550 no such user' });
    await r.settle(ws, c2!.id, ['sending'], { status: 'skipped', reason: 'outcome_unknown' });
    await r.settle(ws, c3!.id, ['sending'], { status: 'queued', retryAt: new Date(Date.now() + 60_000), error: '451 later' });
    expect(await repos(sql).mailings.counts(ws, m.id)).toMatchObject({ total: 5, sent: 1, failed: 1, skipped: 1, queued: 1, sending: 1 });
    // A requeued row is not due yet.
    expect(await r.claimNext(ws, m.id)).toBeNull();

    expect(await r.requeueFailed(ws, m.id, false)).toBe(1);
    expect(await r.requeueFailed(ws, m.id, true)).toBe(1);
    expect(await repos(sql).mailings.counts(ws, m.id)).toMatchObject({ queued: 3, failed: 0, skipped: 0 });
    expect((await repos(sql).messages.latestForRecipient(ws, c0!.id))!.id).toBe(msg.id);
  });

  it('refuses a skipped row without a reason, and a reason on a row that is not skipped', async () => {
    const ws = await workspace();
    const { m } = await mailing(ws);
    await expect(
      sql`INSERT INTO mailing_recipients (workspace_id, mailing_id, email, status) VALUES (${ws}, ${m.id}, 'z@example.com', 'skipped')`,
    ).rejects.toThrow(/check constraint/);
    await expect(
      sql`INSERT INTO mailing_recipients (workspace_id, mailing_id, email, skip_reason) VALUES (${ws}, ${m.id}, 'z@example.com', 'suppressed')`,
    ).rejects.toThrow(/check constraint/);
  });

  it('moves a mailing only from an allowed state (compare-and-set)', async () => {
    const ws = await workspace();
    const { m } = await mailing(ws);
    const mr = repos(sql).mailings;
    const started = await mr.transition(ws, m.id, ['draft', 'scheduled'], 'sending', { startedAt: true });
    expect(started!.status).toBe('sending');
    expect(started!.started_at).not.toBeNull();
    expect(await mr.transition(ws, m.id, ['draft'], 'sending')).toBeNull();
    expect((await mr.listSendingForWorker(100)).some((x) => x.id === m.id && x.workspace_id === ws)).toBe(true);
    const done = await mr.transition(ws, m.id, ['sending'], 'sent', { finishedAt: true });
    expect(done!.finished_at).not.toBeNull();
    expect(await mr.transition(await workspace(), m.id, ['sent'], 'cancelled')).toBeNull();
  });

  it('keeps recipient and message rows when a contact is deleted, with the contact link cleared', async () => {
    const ws = await workspace();
    const { m, p } = await mailing(ws);
    const c = (await repos(sql).contacts.insert(ws, { email: 'e@example.com' }))!;
    await repos(sql).recipients.addMany(ws, m.id, [{ email: 'e@example.com', contactId: c.id, merge: {} }]);
    await repos(sql).messages.insert(ws, {
      mailingId: m.id, recipientId: null, contactId: c.id, to: 'e@example.com', subject: 's', html: 'h', providerId: p.id,
      providerMessageId: null, outcome: 'failed', error: 'x', isTest: false, recipientCount: 1,
    });
    await repos(sql).contacts.delete(ws, c.id);
    const [rec] = await repos(sql).recipients.list(ws, m.id, { limit: 10 });
    expect(rec!.contact_id).toBeNull();
    expect((await repos(sql).messages.list(ws, { limit: 10, mailingId: m.id }))[0]!.contact_id).toBeNull();
  });
});

describe('the rolling 24-hour budget', () => {
  it('reserves up to the budget, then reports when capacity returns, and releases', async () => {
    const ws = await workspace();
    const p = await provider(ws, { daily_recipient_budget: 3, min_interval_ms: 0, max_recipients_per_message: 1 });
    const reserve = (k: number) => sql.begin((tx) => ledgerBudget.reserve(tx, ws, p.id, k));
    const first = await reserve(2);
    expect(first.ok).toBe(true);
    expect((await reserve(1)).ok).toBe(true);
    const full = await reserve(1);
    expect(full).toMatchObject({ ok: false, reason: 'exhausted' });
    const retryAfter = (full as { retryAfter: Date }).retryAfter.getTime();
    expect(retryAfter).toBeGreaterThan(Date.now() + 23 * 3600_000);
    // The database clock stamps the ledger; allow for skew against this process's clock.
    expect(retryAfter).toBeLessThanOrEqual(Date.now() + 24 * 3600_000 + 5_000);
    expect(await reserve(4)).toEqual({ ok: false, reason: 'exceeds_budget' });

    const usage = await ledgerBudget.usage(sql, ws, p.id);
    expect(usage).toMatchObject({ recipients_last_24h: 3, remaining_budget: 0 });
    expect(usage.next_capacity_at).not.toBeNull();

    await sql.begin((tx) => ledgerBudget.release(tx, ws, (first as { reservationId: string }).reservationId));
    expect(await ledgerBudget.usage(sql, ws, p.id)).toMatchObject({ recipients_last_24h: 1, remaining_budget: 2, next_capacity_at: null });
  });

  it('ignores sends older than 24 hours', async () => {
    const ws = await workspace();
    const p = await provider(ws, { daily_recipient_budget: 2, min_interval_ms: 0, max_recipients_per_message: 1 });
    await sql`INSERT INTO provider_sends (workspace_id, provider_id, recipients, created_at)
              VALUES (${ws}, ${p.id}, 2, now() - interval '25 hours')`;
    expect((await sql.begin((tx) => ledgerBudget.reserve(tx, ws, p.id, 2))).ok).toBe(true);
  });

  it('never lets concurrent reservations overspend', async () => {
    const ws = await workspace();
    const p = await provider(ws, { daily_recipient_budget: 5, min_interval_ms: 0, max_recipients_per_message: 1 });
    const results = await Promise.all(
      Array.from({ length: 12 }, () => sql.begin((tx) => ledgerBudget.reserve(tx, ws, p.id, 1))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect((await ledgerBudget.usage(sql, ws, p.id)).recipients_last_24h).toBe(5);
  });

  it('refuses a provider of another workspace', async () => {
    const p = await provider(await workspace());
    await expect(sql.begin((tx) => ledgerBudget.reserve(tx, 'e7a4d6f2-0000-4000-8000-000000000000', p.id, 1))).rejects.toBeInstanceOf(
      UnknownProviderError,
    );
  });
});

describe('the event outbox', () => {
  const unsubscribed = (email: string) =>
    ({
      type: 'contact.unsubscribed',
      data: {
        contact_id: null,
        external_id: null,
        email,
        topic: null,
        mailing_id: null,
        source: 'hosted_page',
        unsubscribed_at: new Date().toISOString(),
      },
    }) as const;

  async function endpoint(ws: string, events: string[], enabled = true) {
    return repos(sql).webhookEndpoints.create(ws, {
      url: 'https://client.example/hooks',
      description: null,
      events: events as never,
      enabled,
      secretSealed: sealer.seal('whsec_test'),
    });
  }

  it('writes the envelope and one pending delivery per subscribed, enabled endpoint', async () => {
    const ws = await workspace();
    const subscribed = await endpoint(ws, ['contact.unsubscribed', 'message.sent']);
    await endpoint(ws, ['message.sent']);
    await endpoint(ws, ['contact.unsubscribed'], false);
    await endpoint(await workspace(), ['contact.unsubscribed']);

    const event = await sql.begin((tx) => emitEvent(tx, ws, unsubscribed('u@example.com')));
    expect(WebhookEvent.parse(event)).toEqual(event);
    expect(event.workspace_id).toBe(ws);
    expect(await repos(sql).webhookEvents.get(ws, event.id)).toEqual(event);
    const deliveries = await repos(sql).webhookDeliveries.list(ws, subscribed.id, { limit: 10 });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ event_id: event.id, status: 'pending', attempts: 0 });
    const all = await sql`SELECT 1 FROM webhook_deliveries WHERE event_id = ${event.id}`;
    expect(all).toHaveLength(1);
  });

  it('leaves no event behind when the change rolls back', async () => {
    const ws = await workspace();
    await endpoint(ws, ['contact.unsubscribed']);
    await expect(
      sql.begin(async (tx) => {
        await emitEvent(tx, ws, unsubscribed('rollback@example.com'));
        throw new Error('the state change failed');
      }),
    ).rejects.toThrow('the state change failed');
    expect(await sql`SELECT 1 FROM webhook_events WHERE workspace_id = ${ws}`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM webhook_deliveries WHERE workspace_id = ${ws}`).toHaveLength(0);
  });

  it('refuses a payload the contract would not parse', async () => {
    const ws = await workspace();
    const bad = { type: 'contact.unsubscribed', data: { email: 'not-an-email' } } as never;
    await expect(sql.begin((tx) => emitEvent(tx, ws, bad))).rejects.toThrow();
    expect(await sql`SELECT 1 FROM webhook_events WHERE workspace_id = ${ws}`).toHaveLength(0);
  });

  it('claims due deliveries once, records attempts, and redelivers by resetting the row', async () => {
    const ws = await workspace();
    const e = await endpoint(ws, ['contact.unsubscribed']);
    const event = await sql.begin((tx) => emitEvent(tx, ws, unsubscribed('d@example.com')));
    const [a, b] = await Promise.all([
      repos(sql).webhookDeliveries.claimDueForWorker(100, 60),
      repos(sql).webhookDeliveries.claimDueForWorker(100, 60),
    ]);
    const mine = [...a!, ...b!].filter((d) => d.workspace_id === ws);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.payload).toEqual(event);
    expect(sealer.open(mine[0]!.secret_sealed)).toBe('whsec_test');
    // Leased: not due again right away.
    expect((await repos(sql).webhookDeliveries.claimDueForWorker(100, 60)).filter((d) => d.workspace_id === ws)).toHaveLength(0);

    const dr = repos(sql).webhookDeliveries;
    const retry = await dr.recordAttempt(ws, mine[0]!.id, {
      status: 'pending', statusCode: 503, error: 'unavailable', nextAttemptAt: new Date(Date.now() + 30_000),
    });
    expect(retry).toMatchObject({ status: 'pending', attempts: 1, last_status_code: 503 });
    const ok = await dr.recordAttempt(ws, mine[0]!.id, { status: 'succeeded', statusCode: 200 });
    expect(ok).toMatchObject({ status: 'succeeded', attempts: 2, last_error: null });
    expect(ok!.delivered_at).not.toBeNull();
    const again = await dr.resetForRedelivery(ws, e.id, mine[0]!.id);
    expect(again).toMatchObject({ status: 'pending', attempts: 0, delivered_at: null });
    expect(await sql`SELECT 1 FROM webhook_deliveries WHERE event_id = ${event.id}`).toHaveLength(1);
    expect(await dr.resetForRedelivery(await workspace(), e.id, mine[0]!.id)).toBeNull();
  });

  it('refuses an unknown event type on an endpoint, and an endpoint without events', async () => {
    const ws = await workspace();
    await expect(endpoint(ws, ['message.opened'])).rejects.toThrow(/check constraint/);
    await expect(endpoint(ws, [])).rejects.toThrow(/check constraint/);
  });
});
