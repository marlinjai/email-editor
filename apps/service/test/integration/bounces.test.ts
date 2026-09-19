import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Provider, WebhookEvent, type WebhookEventOf } from '@marlinjai/mail-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { svixSign } from '../../src/provider-events/svix.js';
import { PermanentSendError } from '../../src/transport/index.js';
import { appOver } from '../support/app-call.js';
import { ERASURE_SECRET, PUBLIC_BASE_URL, startHarness, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, drainUntilSettled, eventsOf, mailingStatus, makeWorker, recipientsOf, seedContact, seedSending } from '../support/sending.js';

/**
 * Hard bounces and spam complaints suppress the address on every topic, whoever
 * reports them: the receiving SMTP server while the message is handed over
 * (synchronous), or Resend's events afterwards (asynchronous). Rejections the
 * sender is at fault for (5.7.x) never suppress; they are counted on the
 * provider. Covered on the stateful-flow paths: forward, backtrack (a block
 * lifted by hand), resume (a retried or replayed event, a registration that
 * failed and is retried on verify), and re-entry (a lifted bounce sends again,
 * and bounces again).
 */

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeEach(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('bounce');
});
afterEach(() => h?.drop());

const HARD = '550 5.1.1 <ada@example.com>: Recipient address rejected: User unknown in virtual mailbox table';
const POLICY = '550 5.7.1 Service unavailable, client host blocked using Spamhaus';

async function suppressionsOf(workspaceId: string) {
  return repos(h.sql).suppressions.list(workspaceId, { limit: 100 });
}

async function bouncedEvents(workspaceId: string) {
  return (await eventsOf(h, workspaceId, 'contact.bounced'))
    .map((e) => WebhookEvent.parse(e.payload))
    .filter((e): e is WebhookEventOf<'contact.bounced'> => e.type === 'contact.bounced');
}

async function mailingTo(s: Awaited<ReturnType<typeof seedSending>>, contactIds: string[]) {
  const mailing = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
  await addRecipients(h, W, mailing.id, contactIds.map((contact_id) => ({ contact_id })));
  const sent = await action(h, W, mailing.id, 'send');
  expect(sent.status, JSON.stringify(sent.body)).toBe(202);
  return mailing;
}

describe('synchronous hard bounces (SMTP)', () => {
  async function setup() {
    const s = await seedSending(h, W.id);
    const ada = await seedContact(h, W.id, s.topic.id, { email: 'ada@example.com', external_id: 'ext-ada' });
    const bob = await seedContact(h, W.id, s.topic.id, { email: 'bob@example.com', external_id: 'ext-bob' });
    return { s, ada, bob };
  }

  it('550 5.1.1 fails the recipient, blocks the address on every topic and emits contact.bounced with the message', async () => {
    const { s, ada, bob } = await setup();
    h.transport.failNextWith(new PermanentSendError(HARD, 550));
    const mailing = await mailingTo(s, [ada.id, bob.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);

    const rows = await recipientsOf(h, W.id, mailing.id);
    const adaRow = rows.find((r) => r.email === 'ada@example.com')!;
    expect(adaRow.status).toBe('failed');
    expect(rows.find((r) => r.email === 'bob@example.com')!.status).toBe('sent');

    const blocks = await suppressionsOf(W.id);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ email: 'ada@example.com', reason: 'bounced', topic_id: null, source_message_id: adaRow.message_id });

    const events = await bouncedEvents(W.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      contact_id: ada.id,
      external_id: 'ext-ada',
      email: 'ada@example.com',
      reason: 'bounced',
      message_id: adaRow.message_id,
    });
    if (events[0]!.type === 'contact.bounced') expect(events[0]!.data.diagnostic).toContain('5.1.1');
    // message.failed still reports the rejection itself, as permanent.
    const failed = await eventsOf(h, W.id, 'message.failed');
    expect(failed.map((e) => e.payload.data.retryable)).toEqual([false]);

    const audit = await h.sql<{ actor: any; details: any }[]>`
      SELECT actor, details FROM audit_log WHERE workspace_id = ${W.id} AND action = 'suppression.created'`;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor.type).toBe('system');

    // The provider is not blamed for a dead address.
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections).toEqual({ count: 0, last_error: null, last_at: null, anomaly: null });
  });

  it('the next mailing skips the bounced address, on any topic', async () => {
    const { s, ada, bob } = await setup();
    h.transport.failNextWith(new PermanentSendError(HARD, 550));
    const first = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, first.id);

    const other = (await repos(h.sql).topics.create(W.id, { slug: 'events', name: 'Events', description: null, translations: {} }))!;
    await repos(h.sql).contacts.subscribe(W.id, ada.id, other.id);
    const second = await createMailing(h, W, { topic: 'events', provider_id: s.provider.id });
    await addRecipients(h, W, second.id, [{ contact_id: ada.id }]);
    await action(h, W, second.id, 'send');
    const third = await mailingTo(s, [ada.id, bob.id]);
    const worker = makeWorker(h);
    await drainUntilSettled(h, worker, W.id, second.id);
    await drainUntilSettled(h, worker, W.id, third.id);

    expect((await recipientsOf(h, W.id, second.id)).map((r) => [r.status, r.skip_reason])).toEqual([['skipped', 'suppressed']]);
    const thirdRows = await recipientsOf(h, W.id, third.id);
    expect(thirdRows.find((r) => r.email === 'ada@example.com')).toMatchObject({ status: 'skipped', skip_reason: 'suppressed' });
    expect(thirdRows.find((r) => r.email === 'bob@example.com')!.status).toBe('sent');
    // Only the first attempt ever reached the provider for ada.
    expect(h.transport.attempts.filter((m) => m.to[0] === 'ada@example.com')).toHaveLength(1);
  });

  it('550 5.7.1 does not suppress: it is counted on the provider, and the address is mailed next time', async () => {
    const { s, ada } = await setup();
    h.transport.failNextWith(new PermanentSendError(POLICY, 550));
    const first = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, first.id);

    expect((await recipientsOf(h, W.id, first.id))[0]!.status).toBe('failed');
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect(await bouncedEvents(W.id)).toEqual([]);
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.count).toBe(1);
    expect(provider.body.rejections.last_error).toBe(POLICY);
    expect(provider.body.rejections.last_at).not.toBeNull();
    expect(Provider.safeParse(provider.body).success).toBe(true);

    const second = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, second.id);
    expect((await recipientsOf(h, W.id, second.id))[0]!.status).toBe('sent');
  });

  it('a mailbox-full rejection (5.2.2) fails the message and changes nothing else', async () => {
    const { s, ada } = await setup();
    h.transport.failNextWith(new PermanentSendError('552 5.2.2 Mailbox full', 552));
    const mailing = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    expect((await recipientsOf(h, W.id, mailing.id))[0]!.status).toBe('failed');
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect((await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key })).body.rejections.count).toBe(0);
  });

  it('re-entry: a bounced address lifted by hand is mailed again, and a second bounce blocks it again', async () => {
    const { s, ada } = await setup();
    h.transport.failNextWith(new PermanentSendError(HARD, 550));
    const first = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, first.id);
    const [block] = await suppressionsOf(W.id);
    const lifted = await h.call({ method: 'DELETE', path: `/v1/suppressions/${block!.id}`, key: W.key });
    expect(lifted.status).toBe(200);
    // Lifting a bounce block reports no resubscribe.
    expect(await eventsOf(h, W.id, 'contact.resubscribed')).toEqual([]);

    const second = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, second.id);
    expect((await recipientsOf(h, W.id, second.id))[0]!.status).toBe('sent');
    expect(h.transport.sent.map((m) => m.to[0])).toEqual(['ada@example.com']);

    h.transport.failNextWith(new PermanentSendError(HARD, 550));
    const third = await mailingTo(s, [ada.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, third.id);
    const again = await suppressionsOf(W.id);
    expect(again).toHaveLength(1);
    expect(again[0]!.id).not.toBe(block!.id);
    expect(again[0]!.source_message_id).toBe((await recipientsOf(h, W.id, third.id))[0]!.message_id);
    expect(await bouncedEvents(W.id)).toHaveLength(2);
  });

  it('a test send that hard-bounces blocks that address too', async () => {
    const { s } = await setup();
    const mailing = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
    h.transport.failNextWith(new PermanentSendError('550 5.1.1 no such user', 550));
    const res = await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/test`, key: W.key, body: { to: 'Gone@Example.com' } });
    expect(res.status).toBe(502);
    const blocks = await suppressionsOf(W.id);
    expect(blocks).toMatchObject([{ email: 'gone@example.com', reason: 'bounced', source_message_id: res.body.error.details.message_id }]);
  });
});

// Resend events

const SECRET = `whsec_${randomBytes(24).toString('base64')}`;

async function resendProvider(workspaceId: string, secret: string | null = SECRET) {
  const r = repos(h.sql);
  const provider = await r.providers.create(workspaceId, {
    kind: 'resend',
    name: 'Resend',
    config: {},
    secretSealed: h.sealer.seal('re_not_a_real_key'),
    fromName: 'Studio',
    fromEmail: 'news@studio.test',
    replyTo: null,
    policy: { daily_recipient_budget: 1000, min_interval_ms: 0, max_recipients_per_message: 1 },
  });
  if (secret) await r.providers.setEventsSecret(workspaceId, provider.id, { secretSealed: h.sealer.seal(secret), source: 'manual', webhookId: null });
  return provider;
}

async function archived(workspaceId: string, providerId: string, to: string, emailId: string, contactId: string | null = null) {
  return repos(h.sql).messages.insert(workspaceId, {
    mailingId: null,
    recipientId: null,
    contactId,
    to,
    subject: 'Hello',
    html: '<p>Hello</p>',
    providerId,
    providerMessageId: emailId,
    outcome: 'sent',
    error: null,
    isTest: false,
    recipientCount: 1,
  });
}

function bounceEvent(emailId: string, to: string, bounceType = 'Permanent') {
  return {
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: emailId,
      from: 'Studio <news@studio.test>',
      to: [to],
      subject: 'Hello',
      bounce: { message: 'The recipient address does not exist.', subType: 'General', type: bounceType },
    },
  };
}

/**
 * A bounce for an email the service never recorded, created over an hour ago:
 * acknowledged without acting. For tests that only check whether a delivery is
 * accepted (its signature), not what it does.
 */
function staleBounce(emailId: string, to: string) {
  return { ...bounceEvent(emailId, to), created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };
}

function complaintEvent(emailId: string, to: string) {
  return { type: 'email.complained', created_at: new Date().toISOString(), data: { email_id: emailId, to: [to], subject: 'Hello' } };
}

async function post(
  providerId: string,
  event: unknown,
  opts: { id?: string; secret?: string; timestamp?: number; signature?: string; raw?: string } = {},
) {
  const raw = opts.raw ?? JSON.stringify(event);
  const id = opts.id ?? `msg_${randomUUID().replace(/-/g, '')}`;
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = opts.signature ?? svixSign(opts.secret ?? SECRET, id, timestamp, raw);
  const res = await h.app.request(`/providers/${providerId}/events/resend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {}, id };
}

describe('Resend events', () => {
  it('a permanent bounce blocks the address the message went to, with the message as its source', async () => {
    const p = await resendProvider(W.id);
    const ada = await repos(h.sql).contacts.insert(W.id, { email: 'ada@example.com', externalId: 'ext-ada' });
    const msg = await archived(W.id, p.id, 'ada@example.com', 're-1', ada!.id);
    const res = await post(p.id, bounceEvent('re-1', 'ada@example.com'));
    expect(res).toMatchObject({ status: 200, body: { ok: true, duplicate: false, outcome: 'suppressed' } });

    expect(await suppressionsOf(W.id)).toMatchObject([{ email: 'ada@example.com', reason: 'bounced', topic_id: null, source_message_id: msg.id }]);
    const events = await bouncedEvents(W.id);
    expect(events.map((e) => e.data)).toMatchObject([
      { contact_id: ada!.id, external_id: 'ext-ada', email: 'ada@example.com', reason: 'bounced', message_id: msg.id },
    ]);
  });

  it('a complaint blocks the address as complained, and hardens an earlier bounce block', async () => {
    const p = await resendProvider(W.id);
    await archived(W.id, p.id, 'bob@example.com', 're-2');
    await post(p.id, bounceEvent('re-2', 'bob@example.com'));
    const res = await post(p.id, complaintEvent('re-2', 'bob@example.com'));
    expect(res.body.outcome).toBe('suppressed');
    const blocks = await suppressionsOf(W.id);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.reason).toBe('complained');
    expect((await bouncedEvents(W.id)).map((e) => e.data)).toMatchObject([{ reason: 'bounced' }, { reason: 'complained' }]);
  });

  it('an unsubscribe block becomes a complaint block; a manual block is left alone and nothing is emitted', async () => {
    const p = await resendProvider(W.id);
    const r = repos(h.sql);
    await r.suppressions.create(W.id, { email: 'cyd@example.com', reason: 'unsubscribed', topicId: null });
    await r.suppressions.create(W.id, { email: 'dan@example.com', reason: 'manual', topicId: null, note: 'asked by phone' });
    await archived(W.id, p.id, 'cyd@example.com', 're-x');
    await archived(W.id, p.id, 'dan@example.com', 're-y');
    expect((await post(p.id, complaintEvent('re-x', 'cyd@example.com'))).body.outcome).toBe('suppressed');
    expect((await post(p.id, bounceEvent('re-y', 'dan@example.com'))).body.outcome).toBe('already_suppressed');
    const byEmail = new Map((await suppressionsOf(W.id)).map((s) => [s.email, s]));
    expect(byEmail.get('cyd@example.com')!.reason).toBe('complained');
    expect(byEmail.get('dan@example.com')).toMatchObject({ reason: 'manual', note: 'asked by phone' });
    expect((await bouncedEvents(W.id)).map((e) => e.data.email)).toEqual(['cyd@example.com']);
  });

  it('an unmatched event younger than an hour answers 503 and records nothing; the redelivery after the send is recorded suppresses', async () => {
    const p = await resendProvider(W.id);
    const event = bounceEvent('re-late', 'late@example.com');
    const first = await post(p.id, event);
    expect(first.status).toBe(503);
    const [claims] = await h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM provider_events WHERE provider_id = ${p.id}`;
    expect(claims!.n).toBe(0);
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect((await h.call({ path: `/v1/providers/${p.id}`, key: W.key })).body.events.unmatched).toBe(0);

    // The worker records the send; Resend redelivers the same event (same svix-id, signed afresh).
    const msg = await archived(W.id, p.id, 'late@example.com', 're-late');
    const again = await post(p.id, event, { id: first.id, timestamp: Math.floor(Date.now() / 1000) + 5 });
    expect(again).toMatchObject({ status: 200, body: { duplicate: false, outcome: 'suppressed' } });
    expect(await suppressionsOf(W.id)).toMatchObject([{ email: 'late@example.com', source_message_id: msg.id }]);
  });

  it('an unmatched event older than an hour, or without a readable created_at, is acknowledged, counted and logged, never acted on', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    h.restartApp(); // the app takes console.log when it is built
    const p = await resendProvider(W.id);
    await repos(h.sql).contacts.insert(W.id, { email: 'eve@example.com', externalId: 'ext-eve' });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const events = [
      { ...bounceEvent('re-unknown', 'eve@example.com'), created_at: old },
      { ...complaintEvent('re-unknown-2', 'eve@example.com'), created_at: old },
      { ...bounceEvent('re-unknown-3', 'eve@example.com'), created_at: undefined },
      { ...bounceEvent('re-unknown-4', 'eve@example.com'), created_at: 'yesterday-ish' },
    ];
    let firstId = '';
    for (const event of events) {
      const res = await post(p.id, event);
      firstId ||= res.id;
      expect(res, JSON.stringify(event)).toMatchObject({ status: 200, body: { ok: true, duplicate: false, outcome: 'unmatched' } });
    }
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect(await bouncedEvents(W.id)).toEqual([]);
    expect((await h.call({ path: `/v1/providers/${p.id}`, key: W.key })).body.events.unmatched).toBe(4);
    // A redelivery of an acknowledged event is a duplicate and not counted again.
    expect((await post(p.id, events[0], { id: firstId })).body).toMatchObject({ duplicate: true, outcome: 'unmatched' });
    expect((await h.call({ path: `/v1/providers/${p.id}`, key: W.key })).body.events.unmatched).toBe(4);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('never sent; ignored'))).toBe(true);
    logSpy.mockRestore();
    h.restartApp();
  });

  it('a transient or undetermined bounce, a delay and other types are acknowledged and ignored', async () => {
    const p = await resendProvider(W.id);
    for (const id of ['re-soft', 're-und', 're-d', 're-o']) await archived(W.id, p.id, `${id.slice(3)}@example.com`, id);
    for (const event of [
      bounceEvent('re-soft', 'soft@example.com', 'Transient'),
      bounceEvent('re-und', 'und@example.com', 'Undetermined'),
      { type: 'email.delivery_delayed', created_at: new Date().toISOString(), data: { email_id: 're-d', to: ['slow@example.com'] } },
      { type: 'email.opened', created_at: new Date().toISOString(), data: { email_id: 're-o', to: ['o@example.com'] } },
    ]) {
      const res = await post(p.id, event);
      expect(res, JSON.stringify(event)).toMatchObject({ status: 200, body: { ok: true, outcome: 'ignored' } });
    }
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect(await bouncedEvents(W.id)).toEqual([]);
  });

  it('refuses a bad signature, another secret, a stale timestamp, missing headers and a body changed after signing', async () => {
    const p = await resendProvider(W.id);
    const event = staleBounce('re-3', 'x@example.com');
    const other = `whsec_${randomBytes(24).toString('base64')}`;
    expect((await post(p.id, event, { signature: 'v1,AAAA' })).status).toBe(400);
    expect((await post(p.id, event, { secret: other })).status).toBe(400);
    expect((await post(p.id, event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    expect((await post(p.id, event, { timestamp: Math.floor(Date.now() / 1000) + 3600 })).status).toBe(400);
    const raw = JSON.stringify(event);
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = svixSign(SECRET, 'msg_a', ts, raw);
    expect((await post(p.id, null, { id: 'msg_a', timestamp: Number(ts), signature: signed, raw: raw.replace('x@example.com', 'y@example.com') })).status).toBe(400);
    const bare = await h.app.request(`/providers/${p.id}/events/resend`, { method: 'POST', body: raw });
    expect(bare.status).toBe(400);
    expect(await suppressionsOf(W.id)).toEqual([]);
    // A signature among several (a secret rotation at Resend) is enough.
    const rotated = await post(p.id, event, { id: 'msg_b', signature: `v1,AAAA ${svixSign(SECRET, 'msg_b', ts, raw)}`, timestamp: Number(ts) });
    expect(rotated.status).toBe(200);
  });

  it('a retry or a replay of the same svix-id changes nothing, also when two arrive at once', async () => {
    const p = await resendProvider(W.id);
    await archived(W.id, p.id, 'fay@example.com', 're-4');
    const event = bounceEvent('re-4', 'fay@example.com');
    const [a, b] = await Promise.all([post(p.id, event, { id: 'msg_same' }), post(p.id, event, { id: 'msg_same' })]);
    expect([a.body.duplicate, b.body.duplicate].sort()).toEqual([false, true]);
    // Re-signed later with a fresh timestamp: still the same event.
    const replay = await post(p.id, event, { id: 'msg_same', timestamp: Math.floor(Date.now() / 1000) + 5 });
    expect(replay.body).toEqual({ ok: true, duplicate: true, outcome: 'suppressed' });
    expect(await suppressionsOf(W.id)).toHaveLength(1);
    expect(await bouncedEvents(W.id)).toHaveLength(1);
  });

  it('answers 404 for an unknown, a malformed or an SMTP provider, and 503 while no secret is stored', async () => {
    const smtp = await seedSending(h, W.id);
    const event = bounceEvent('re-5', 'x@example.com');
    expect((await post(randomUUID(), event)).status).toBe(404);
    expect((await post('not-a-uuid', event)).status).toBe(404);
    expect((await post(smtp.provider.id, event)).status).toBe(404);
    const bare = await resendProvider(W.id, null);
    expect((await post(bare.id, event)).status).toBe(503);
    expect(h.errors.some((e) => String((e as unknown[])[0]).includes('no signing secret'))).toBe(true);
    expect((await post(bare.id, null, { raw: '{"not":"json"' })).status).toBe(503);
  });

  it('refuses a body that is not a Resend event, after the signature', async () => {
    const p = await resendProvider(W.id);
    expect((await post(p.id, null, { raw: 'not json' })).status).toBe(400);
    expect((await post(p.id, { hello: 'world' })).status).toBe(400);
  });

  it('a deleted provider still accepts events for mail it sent', async () => {
    const p = await resendProvider(W.id);
    await archived(W.id, p.id, 'gus@example.com', 're-6');
    expect((await h.call({ method: 'DELETE', path: `/v1/providers/${p.id}`, key: W.key })).status).toBe(200);
    expect((await post(p.id, bounceEvent('re-6', 'gus@example.com'))).body.outcome).toBe('suppressed');
  });

  it("tenancy: an event for A's provider changes only A, and B's secret cannot sign for A", async () => {
    const B = await h.seedWorkspace('bounce-b');
    const pa = await resendProvider(W.id);
    const secretB = `whsec_${randomBytes(24).toString('base64')}`;
    const pb = await resendProvider(B.id, secretB);
    await repos(h.sql).contacts.insert(B.id, { email: 'shared@example.com' });
    await archived(B.id, pb.id, 'shared@example.com', 're-b');

    // B's message id, sent to A's endpoint: A has no such message, so nothing happens anywhere.
    const oldB = { ...bounceEvent('re-b', 'shared@example.com'), created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };
    const res = await post(pa.id, oldB);
    expect(res.body.outcome).toBe('unmatched');
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect(await suppressionsOf(B.id)).toEqual([]);
    expect(await bouncedEvents(B.id)).toEqual([]);

    expect((await post(pa.id, bounceEvent('re-z', 'z@example.com'), { secret: secretB })).status).toBe(400);
    // The same svix-id at another provider is another event.
    const atB = await post(pb.id, oldB, { id: res.id, secret: secretB });
    expect(atB.body).toMatchObject({ duplicate: false, outcome: 'suppressed' });
    expect(await suppressionsOf(B.id)).toHaveLength(1);
    expect(await suppressionsOf(W.id)).toEqual([]);
  });

  it('the suppressions list filters by the new reasons', async () => {
    const p = await resendProvider(W.id);
    await archived(W.id, p.id, 'b1@example.com', 're-7');
    await archived(W.id, p.id, 'c1@example.com', 're-8');
    await post(p.id, bounceEvent('re-7', 'b1@example.com'));
    await post(p.id, complaintEvent('re-8', 'c1@example.com'));
    await repos(h.sql).suppressions.create(W.id, { email: 'm1@example.com', reason: 'manual', topicId: null });
    for (const [reason, email] of [
      ['bounced', 'b1@example.com'],
      ['complained', 'c1@example.com'],
      ['manual', 'm1@example.com'],
    ]) {
      const res = await h.call({ path: `/v1/suppressions?reason=${reason}`, key: W.key });
      expect(res.body.data.map((s: any) => s.email), reason).toEqual([email]);
    }
  });
});

// Registering the events endpoint at Resend

type Seen = { url: string; method: string; body: any; auth: string };

function fakeResend(answers: { webhooks?: () => Response | Promise<Response>; domains?: () => Response; remove?: () => Response }) {
  const seen: Seen[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    seen.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
      auth: String((init.headers as Record<string, string>).authorization),
    });
    if (url.endsWith('/webhooks') && init.method === 'POST') return answers.webhooks ? answers.webhooks() : new Response('{}', { status: 500 });
    if (url.includes('/webhooks/') && init.method === 'DELETE') return answers.remove ? answers.remove() : new Response('{}', { status: 200 });
    return answers.domains ? answers.domains() : new Response('{"data":[]}', { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

const RESEND_KEY = `re_${randomBytes(18).toString('base64url')}`;
const createBody = {
  kind: 'resend',
  name: 'Resend',
  config: { api_key: RESEND_KEY },
  from_name: 'Studio',
  from_email: 'news@studio.test',
  reply_to: null,
  policy: { daily_recipient_budget: 1000, min_interval_ms: 0, max_recipients_per_message: 1 },
};
const registered = () => new Response(JSON.stringify({ object: 'webhook', id: 'wh_123', signing_secret: SECRET }), { status: 201 });
const restricted = () => new Response(JSON.stringify({ name: 'restricted_api_key', message: 'This API key is restricted to only send emails' }), { status: 401 });

describe('Resend events endpoint registration', () => {
  it('forward: creating a Resend provider registers the endpoint and stores its secret sealed', async () => {
    const resend = fakeResend({ webhooks: registered });
    const app = appOver(h, { providerFetch: resend.fetch });
    const created = await app.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    expect(created.status).toBe(201);
    const url = `${PUBLIC_BASE_URL}/providers/${created.body.id}/events/resend`;
    expect(created.body.events).toEqual({ status: 'active', source: 'automatic', url, error: null, unmatched: 0 });
    expect(Provider.safeParse(created.body).success).toBe(true);
    expect(resend.seen).toEqual([
      {
        url: 'https://api.resend.com/webhooks',
        method: 'POST',
        body: { endpoint: url, events: ['email.bounced', 'email.complained', 'email.delivery_delayed'] },
        auth: `Bearer ${RESEND_KEY}`,
      },
    ]);
    const [row] = await h.sql<{ events_secret_sealed: string; events_webhook_id: string }[]>`
      SELECT events_secret_sealed, events_webhook_id FROM providers WHERE id = ${created.body.id}`;
    expect(row!.events_secret_sealed).toMatch(/^sealed:v1:/);
    expect(h.sealer.open(row!.events_secret_sealed)).toBe(SECRET);
    expect(row!.events_webhook_id).toBe('wh_123');
    const audit = await h.sql<{ action: string }[]>`SELECT action FROM audit_log WHERE target_id = ${created.body.id} ORDER BY created_at`;
    expect(audit.map((a) => a.action)).toEqual(['provider.created', 'provider.events_registered']);

    // Events signed with that secret are accepted at once.
    expect((await post(created.body.id, staleBounce('re-9', 'h@example.com'))).status).toBe(200);

    // Verifying again registers nothing more.
    await app.call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: W.key });
    expect(resend.seen.filter((s) => s.url.endsWith('/webhooks'))).toHaveLength(1);

    // Deleting the provider removes the endpoint the service registered.
    expect((await app.call({ method: 'DELETE', path: `/v1/providers/${created.body.id}`, key: W.key })).status).toBe(200);
    expect(resend.seen.at(-1)).toMatchObject({ url: 'https://api.resend.com/webhooks/wh_123', method: 'DELETE', auth: `Bearer ${RESEND_KEY}` });
  });

  it('a sending-only key cannot register: the provider says why and shows the URL; a pasted secret activates it', async () => {
    const app = appOver(h, { providerFetch: fakeResend({ webhooks: restricted }).fetch });
    const created = await app.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    expect(created.status).toBe(201);
    expect(created.body.events).toMatchObject({ status: 'needs_secret', source: null, url: `${PUBLIC_BASE_URL}/providers/${created.body.id}/events/resend` });
    expect(created.body.events.error).toMatch(/may only send/);
    expect((await post(created.body.id, bounceEvent('re-10', 'i@example.com'))).status).toBe(503);
    await archived(W.id, created.body.id, 'i@example.com', 're-10');

    const set = await h.call({ method: 'PUT', path: `/v1/providers/${created.body.id}/events-secret`, key: W.key, body: { signing_secret: SECRET } });
    expect(set.status).toBe(200);
    expect(set.body.events).toMatchObject({ status: 'active', source: 'manual', error: null });
    expect(JSON.stringify(set.body)).not.toContain(SECRET);
    expect((await post(created.body.id, bounceEvent('re-10', 'i@example.com'))).body.outcome).toBe('suppressed');

    // Deleting a provider whose endpoint was added by hand calls nothing at Resend.
    const resend = fakeResend({});
    await appOver(h, { providerFetch: resend.fetch }).call({ method: 'DELETE', path: `/v1/providers/${created.body.id}`, key: W.key });
    expect(resend.seen).toEqual([]);
  });

  it('resume: a registration that failed on create (Resend unreachable) succeeds on the next verify', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    expect(created.status).toBe(201);
    expect(created.body.events).toMatchObject({ status: 'needs_secret', error: expect.stringMatching(/could not be reached/) });
    const resend = fakeResend({ webhooks: registered });
    const verified = await appOver(h, { providerFetch: resend.fetch }).call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: W.key });
    expect(verified.body).toEqual({ ok: true, error: null });
    const after = await h.call({ path: `/v1/providers/${created.body.id}`, key: W.key });
    expect(after.body.events).toMatchObject({ status: 'active', source: 'automatic', error: null });
  });

  it('a failed verify does not try to register; other Resend refusals are recorded with their status', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    const refused = fakeResend({ domains: () => new Response('{"name":"validation_error"}', { status: 401 }) });
    await appOver(h, { providerFetch: refused.fetch }).call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: W.key });
    expect(refused.seen.map((s) => s.url)).toEqual(['https://api.resend.com/domains']);

    const odd = fakeResend({ webhooks: () => new Response(JSON.stringify({ message: 'endpoint must be https' }), { status: 422 }) });
    await appOver(h, { providerFetch: odd.fetch }).call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: W.key });
    const after = await h.call({ path: `/v1/providers/${created.body.id}`, key: W.key });
    expect(after.body.events.error).toBe('Resend refused to register the events endpoint (status 422): endpoint must be https.');

    const noSecret = fakeResend({ webhooks: () => new Response(JSON.stringify({ id: 'wh_1' }), { status: 201 }) });
    await appOver(h, { providerFetch: noSecret.fetch }).call({ method: 'POST', path: `/v1/providers/${created.body.id}/verify`, key: W.key });
    expect((await h.call({ path: `/v1/providers/${created.body.id}`, key: W.key })).body.events).toMatchObject({
      status: 'needs_secret',
      error: expect.stringMatching(/without a usable signing secret/),
    });
  });

  it('backtrack: a new API key from the same account keeps the endpoint; one from another account registers anew', async () => {
    const created = await appOver(h, { providerFetch: fakeResend({ webhooks: registered }).fetch }).call({
      method: 'POST',
      path: '/v1/providers',
      key: W.key,
      body: createBody,
    });
    const rotate = (key: string) => ({ kind: 'resend', config: { api_key: key } });
    const sameKey = `re_${randomBytes(18).toString('base64url')}`;
    const same = fakeResend({ domains: () => new Response('{"object":"webhook","id":"wh_123"}', { status: 200 }) });
    const kept = await appOver(h, { providerFetch: same.fetch }).call({ method: 'PATCH', path: `/v1/providers/${created.body.id}`, key: W.key, body: rotate(sameKey) });
    expect(kept.status).toBe(200);
    expect(same.seen.map((s) => `${s.method} ${s.url}`)).toEqual(['GET https://api.resend.com/webhooks/wh_123']);
    expect(kept.body.events).toMatchObject({ status: 'active', source: 'automatic' });
    expect((await post(created.body.id, staleBounce('re-12', 'k@example.com'))).status).toBe(200);

    const otherSecret = `whsec_${randomBytes(24).toString('base64')}`;
    const otherKey = `re_${randomBytes(18).toString('base64url')}`;
    const other = fakeResend({
      domains: () => new Response('{"name":"not_found"}', { status: 404 }),
      webhooks: () => new Response(JSON.stringify({ object: 'webhook', id: 'wh_456', signing_secret: otherSecret }), { status: 201 }),
    });
    const moved = await appOver(h, { providerFetch: other.fetch }).call({ method: 'PATCH', path: `/v1/providers/${created.body.id}`, key: W.key, body: rotate(otherKey) });
    expect(moved.body.events).toMatchObject({ status: 'active', source: 'automatic', error: null });
    // Checked with the new key, removed from the old account with the old key, registered with the new one.
    expect(other.seen.map((s) => `${s.method} ${s.url} ${s.auth === `Bearer ${otherKey}` ? 'new' : s.auth === `Bearer ${sameKey}` ? 'old' : '?'}`)).toEqual([
      'GET https://api.resend.com/webhooks/wh_123 new',
      'DELETE https://api.resend.com/webhooks/wh_123 old',
      'POST https://api.resend.com/webhooks new',
    ]);
    expect((await post(created.body.id, staleBounce('re-13', 'l@example.com'))).status).toBe(400);
    expect((await post(created.body.id, staleBounce('re-13', 'l@example.com'), { secret: otherSecret })).status).toBe(200);

    // A rename without a new key calls nothing at Resend.
    const quiet = fakeResend({});
    await appOver(h, { providerFetch: quiet.fetch }).call({ method: 'PATCH', path: `/v1/providers/${created.body.id}`, key: W.key, body: { kind: 'resend', name: 'Renamed' } });
    expect(quiet.seen).toEqual([]);
  });

  it('an instance without a public https address does not call Resend and says so', async () => {
    const resend = fakeResend({ webhooks: registered });
    const created = await appOver(h, { providerFetch: resend.fetch, publicBaseUrl: 'http://localhost:8787' }).call({
      method: 'POST',
      path: '/v1/providers',
      key: W.key,
      body: createBody,
    });
    expect(resend.seen).toEqual([]);
    expect(created.body.events).toMatchObject({ status: 'needs_secret', url: `http://localhost:8787/providers/${created.body.id}/events/resend` });
    expect(created.body.events.error).toMatch(/no public https address/);
  });

  it('the events secret: validated, Resend providers only, replaceable, and never shown or logged', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    const path = `/v1/providers/${created.body.id}/events-secret`;
    for (const body of [{}, { signing_secret: 'whsec_short' }, { signing_secret: RESEND_KEY }]) {
      const res = await h.call({ method: 'PUT', path, key: W.key, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const smtp = await seedSending(h, W.id);
    const onSmtp = await h.call({ method: 'PUT', path: `/v1/providers/${smtp.provider.id}/events-secret`, key: W.key, body: { signing_secret: SECRET } });
    expect(onSmtp.status).toBe(400);
    expect(onSmtp.body.error.code).toBe('validation_failed');

    const second = `whsec_${randomBytes(24).toString('base64')}`;
    await h.call({ method: 'PUT', path, key: W.key, body: { signing_secret: SECRET } });
    await h.call({ method: 'PUT', path, key: W.key, body: { signing_secret: second } });
    expect((await post(created.body.id, staleBounce('re-11', 'j@example.com'))).status).toBe(400);
    expect((await post(created.body.id, staleBounce('re-11', 'j@example.com'), { secret: second })).status).toBe(200);

    const audit = await h.sql<{ action: string; details: string }[]>`
      SELECT action, details::text AS details FROM audit_log WHERE target_id = ${created.body.id} ORDER BY created_at`;
    expect(audit.map((a) => a.action)).toEqual(['provider.created', 'provider.events_secret_set', 'provider.events_secret_set']);
    const everything = JSON.stringify([audit, await h.call({ path: '/v1/providers', key: W.key }), h.errors]);
    expect(everything).not.toContain(SECRET.slice(6));
    expect(everything).not.toContain(second.slice(6));
    expect(everything).not.toContain(RESEND_KEY);
  });

  it("tenancy: B cannot set A's events secret; a revoked key and a send-scoped key are refused", async () => {
    const B = await h.seedWorkspace('bounce-b2');
    const created = await h.call({ method: 'POST', path: '/v1/providers', key: W.key, body: createBody });
    const path = `/v1/providers/${created.body.id}/events-secret`;
    const other = await h.call({ method: 'PUT', path, key: B.key, body: { signing_secret: SECRET } });
    expect(other.status).toBe(404);
    expect((await h.call({ path: `/v1/providers/${created.body.id}`, key: W.key })).body.events.status).toBe('needs_secret');

    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${minted.body.api_key.id}`, key: W.key });
    expect((await h.call({ method: 'PUT', path, key: minted.body.key, body: { signing_secret: SECRET } })).status).toBe(401);
    const send = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'send', scope: 'send' } });
    expect((await h.call({ method: 'PUT', path, key: send.body.key, body: { signing_secret: SECRET } })).status).toBe(403);
  });
});

// The bounce circuit breaker

describe('bounce circuit breaker', () => {
  const SAME = (i: number) => `550 5.1.1 <person${i}@example.com>: Recipient address rejected: User unknown in local recipient table`;

  async function people(n: number) {
    const s = await seedSending(h, W.id);
    const contacts = [];
    for (let i = 0; i < n; i++) contacts.push(await seedContact(h, W.id, s.topic.id, { email: `person${i}@example.com`, external_id: `ext-${i}` }));
    return { s, contacts };
  }

  /** Drains until nothing is in flight; a paused mailing keeps its queued recipients. */
  async function drained(mailingId: string) {
    const worker = makeWorker(h);
    for (let round = 0; round < 50; round++) {
      await worker.drain();
      const rows = await recipientsOf(h, W.id, mailingId);
      if (!rows.some((r) => r.status === 'sending')) return;
    }
  }

  it('forward: a few real bounces among many deliveries still block their addresses, no pause', async () => {
    const { s, contacts } = await people(12);
    h.transport.failNextWith(new PermanentSendError(SAME(0), 550));
    h.transport.failNextWith(new PermanentSendError('550 5.1.1 <person1@example.com>: mailbox does not exist', 550));
    const mailing = await mailingTo(s, contacts.map((c) => c.id));
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('partially_failed');
    expect((await suppressionsOf(W.id)).map((x) => x.email).sort()).toEqual(['person0@example.com', 'person1@example.com']);
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.anomaly).toBeNull();
  });

  it("trip: five refusals in a row with the same reply undo the run's blocks, pause the mailing and flag the provider", async () => {
    const { s, contacts } = await people(8);
    for (let i = 0; i < 5; i++) h.transport.failNextWith(new PermanentSendError(SAME(i), 550));
    const mailing = await mailingTo(s, contacts.map((c) => c.id));
    await drained(mailing.id);

    expect(await mailingStatus(h, W.id, mailing.id)).toBe('paused');
    const rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.filter((r) => r.status === 'failed')).toHaveLength(5);
    expect(rows.filter((r) => r.status === 'queued')).toHaveLength(3);
    // The four blocks made before the fifth refusal were undone; the fifth was never made.
    expect(await suppressionsOf(W.id)).toEqual([]);
    expect(await bouncedEvents(W.id)).toHaveLength(4);
    const reverted = (await eventsOf(h, W.id, 'contact.resubscribed')).map((e) => WebhookEvent.parse(e.payload));
    expect(reverted).toHaveLength(4);
    for (const e of reverted) expect(e.data).toMatchObject({ source: 'bounce_reverted', topic: null, mailing_id: mailing.id });

    const shown = await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key });
    expect(shown.body.status).toBe('paused');
    expect(shown.body.pause_reason).toMatch(/bounce circuit breaker.*5 recipients in a row.*4 bounce blocks from this run were undone/s);
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.anomaly).toMatchObject({ scope: 'mailing', blocking: false, mailing_id: mailing.id, sample: SAME(4) });
    expect(provider.body.rejections.anomaly.reason).toMatch(/in a row/);
    const audit = await h.sql<{ actor: any }[]>`SELECT actor FROM audit_log WHERE workspace_id = ${W.id} AND action = 'mailing.paused'`;
    expect(audit.map((a) => a.actor.type)).toEqual(['system']);
  });

  it('trip: more than 20 percent of the first 50 refused, even with different replies', async () => {
    const { s, contacts } = await people(14);
    for (let i = 0; i < 11; i++) h.transport.failNextWith(new PermanentSendError(`550 5.1.1 user unknown, reference ${i}`, 550));
    const mailing = await mailingTo(s, contacts.map((c) => c.id));
    await drained(mailing.id);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('paused');
    expect(await suppressionsOf(W.id)).toEqual([]);
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.anomaly.reason).toMatch(/20 percent of the first 50/);
  });

  it('resume: after the provider is fixed and the mailing resumed, the rest is sent and real bounces block again', async () => {
    const { s, contacts } = await people(8);
    for (let i = 0; i < 5; i++) h.transport.failNextWith(new PermanentSendError(SAME(i), 550));
    const mailing = await mailingTo(s, contacts.map((c) => c.id));
    await drained(mailing.id);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('paused');

    // Resuming starts a new run: one genuine bounce in it is blocked as usual.
    h.transport.failNextWith(new PermanentSendError('550 5.1.1 <person5@example.com>: no such user', 550));
    const resumed = await action(h, W, mailing.id, 'resume');
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(202);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    const shown = await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key });
    expect(shown.body).toMatchObject({ status: 'partially_failed', pause_reason: null });
    expect((await suppressionsOf(W.id)).map((x) => x.email)).toEqual(['person5@example.com']);
    expect(h.transport.sent.map((m) => m.to[0]).sort()).toEqual(['person6@example.com', 'person7@example.com']);
  });

  it('re-entry: retrying the failed after the fix mails the addresses whose blocks were undone', async () => {
    const { s, contacts } = await people(6);
    for (let i = 0; i < 5; i++) h.transport.failNextWith(new PermanentSendError(SAME(i), 550));
    const mailing = await mailingTo(s, contacts.map((c) => c.id));
    await drained(mailing.id);
    expect((await action(h, W, mailing.id, 'resume')).status).toBe(202);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('partially_failed');

    const retried = await action(h, W, mailing.id, 'retry-failed');
    expect(retried.status, JSON.stringify(retried.body)).toBe(202);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    expect(h.transport.sent.map((m) => m.to[0]).sort()).toEqual(contacts.map((c) => c.email).sort());
    expect(await suppressionsOf(W.id)).toEqual([]);
  });
});

describe('workspace erasure', () => {
  it('unregisters the Resend events endpoints the service registered, best effort', async () => {
    const seen: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const auth = String((init.headers as Record<string, string>).authorization);
      seen.push(`${init.method ?? 'GET'} ${url} ${auth === `Bearer ${RESEND_KEY}`}`);
      if (url.endsWith('/webhooks') && init.method === 'POST') return registered();
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const app = appOver(h, { providerFetch: fake, erasureWebhookSecret: ERASURE_SECRET });
    const company = randomUUID();
    const ws = await app.call({
      method: 'POST',
      path: '/v1/workspaces',
      subject: 'erase-owner',
      body: { slug: 'erase-me', name: 'Erase me', owner: { email: 'erase-owner@example.com' }, company_id: company },
    });
    expect(ws.status, JSON.stringify(ws.body)).toBe(201);
    const created = await app.call({ method: 'POST', path: '/v1/providers', subject: 'erase-owner', workspace: ws.body.id, body: createBody });
    expect(created.body.events.source).toBe('automatic');

    const raw = JSON.stringify({ event_id: randomUUID(), kind: 'tenant.erased', user_id: 'u1', tenant_id: company, requested_at: '2026-09-19T10:00:00.000Z' });
    const signature = `sha256=${createHmac('sha256', ERASURE_SECRET).update(raw, 'utf8').digest('hex')}`;
    const res = await app.app.request('/internal/erasure', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lumitra-erasure-signature': signature },
      body: raw,
    });
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toBe('DELETE https://api.resend.com/webhooks/wh_123 true');
  });
});

// The provider-wide bounce breaker, and exact reverts

describe('provider-wide bounce breaker', () => {
  const ALIKE = (i: number) => `550 5.1.1 <one${i}@example.com>: Recipient address rejected: User unknown in local recipient table`;

  async function setup() {
    const s = await seedSending(h, W.id);
    // A mailing still sending while the streak builds up (nothing drains it until later).
    const others = [];
    for (let i = 0; i < 3; i++) others.push(await seedContact(h, W.id, s.topic.id, { email: `other${i}@example.com` }));
    const active = await mailingTo(s, others.map((c) => c.id));
    const draft = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
    return { s, active, draft };
  }

  const testSend = (mailingId: string, to: string) => h.call({ method: 'POST', path: `/v1/mailings/${mailingId}/test`, key: W.key, body: { to } });

  /** Five test sends refused alike: the fifth trips the provider's breaker. */
  async function tripByTestSends(draftId: string, prefix = 'one') {
    for (let i = 0; i < 5; i++) {
      h.transport.failNextWith(new PermanentSendError(ALIKE(i), 550));
      const res = await testSend(draftId, `${prefix}${i}@example.com`);
      expect(res.status, JSON.stringify(res.body)).toBe(502);
    }
  }

  /** A one-to-one mailing, sent and drained. */
  async function onePerson(s: Awaited<ReturnType<typeof seedSending>>, email: string) {
    const c = await seedContact(h, W.id, s.topic.id, { email });
    const m = await mailingTo(s, [c.id]);
    await drainUntilSettled(h, makeWorker(h), W.id, m.id);
    return m;
  }

  it('forward: one-to-one sends with different replies keep blocking; four alike do not trip', async () => {
    const { draft } = await setup();
    for (let i = 0; i < 4; i++) {
      h.transport.failNextWith(new PermanentSendError(ALIKE(i), 550));
      await testSend(draft.id, `one${i}@example.com`);
    }
    h.transport.failNextWith(new PermanentSendError('550 5.1.1 <one4@example.com>: no such mailbox here', 550));
    await testSend(draft.id, 'one4@example.com');
    expect((await suppressionsOf(W.id)).map((x) => x.email).sort()).toEqual([0, 1, 2, 3, 4].map((i) => `one${i}@example.com`));
    const provider = await h.call({ path: `/v1/providers/${draft.provider_id}`, key: W.key });
    expect(provider.body.rejections.anomaly).toBeNull();
    expect((await testSend(draft.id, 'fine@example.com')).status).toBe(200);
  });

  it('trip: five test sends refused alike undo the blocks exactly, pause active mailings, refuse test sends and starts', async () => {
    const { s, active, draft } = await setup();
    // one0 had unsubscribed from everything; a test send (which ignores blocks) hardens it to bounced.
    await repos(h.sql).suppressions.create(W.id, { email: 'one0@example.com', reason: 'unsubscribed', topicId: null });
    await tripByTestSends(draft.id);

    // Exact revert: one0 is unsubscribed again, silently; one1 to one3 were created by the streak and are gone.
    const blocks = await suppressionsOf(W.id);
    expect(blocks.map((b) => [b.email, b.reason, b.replaced_reason])).toEqual([['one0@example.com', 'unsubscribed', null]]);
    const reverted = (await eventsOf(h, W.id, 'contact.resubscribed')).map((e) => WebhookEvent.parse(e.payload));
    expect(reverted.map((e) => (e.data as { email: string }).email).sort()).toEqual(['one1@example.com', 'one2@example.com', 'one3@example.com']);
    for (const e of reverted) expect(e.data).toMatchObject({ source: 'bounce_reverted', topic: null });

    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.anomaly).toMatchObject({ scope: 'provider', blocking: true, sample: ALIKE(4) });
    expect(Provider.safeParse(provider.body).success).toBe(true);

    const pausedActive = await h.call({ path: `/v1/mailings/${active.id}`, key: W.key });
    expect(pausedActive.body).toMatchObject({ status: 'paused' });
    expect(pausedActive.body.pause_reason).toMatch(/provider's bounce circuit breaker/);

    // Test sends, resumes and new sends are refused with a clear error until an admin clears it.
    const refused = await testSend(draft.id, 'someone@example.com');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('provider_anomaly');
    expect(refused.body.error.message).toMatch(/clear its anomaly/);
    expect((await action(h, W, active.id, 'resume')).body.error.code).toBe('provider_anomaly');
    const c = await seedContact(h, W.id, s.topic.id, { email: 'later@example.com' });
    const fresh = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
    await addRecipients(h, W, fresh.id, [{ contact_id: c.id }]);
    expect((await action(h, W, fresh.id, 'send')).body.error.code).toBe('provider_anomaly');

    const audit = await h.sql<{ action: string }[]>`
      SELECT action FROM audit_log WHERE workspace_id = ${W.id} AND action IN ('provider.bounces_halted', 'mailing.paused') ORDER BY created_at`;
    expect(audit.map((a) => a.action).sort()).toEqual(['mailing.paused', 'provider.bounces_halted']);
  });

  it('resume: after an admin clears the anomaly, test sends, resumes and real bounces work again', async () => {
    const { s, active, draft } = await setup();
    await tripByTestSends(draft.id);

    const cleared = await h.call({ method: 'POST', path: `/v1/providers/${s.provider.id}/clear-anomaly`, key: W.key });
    expect(cleared.status).toBe(200);
    expect(cleared.body.rejections.anomaly).toBeNull();
    const audit = await h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_log WHERE workspace_id = ${W.id} AND action = 'provider.anomaly_cleared'`;
    expect(audit[0]!.n).toBe(1);

    expect((await testSend(draft.id, 'fine@example.com')).status).toBe(200);
    expect((await action(h, W, active.id, 'resume')).status).toBe(202);
    await drainUntilSettled(h, makeWorker(h), W.id, active.id);
    expect(await mailingStatus(h, W.id, active.id)).toBe('sent');

    // A genuine bounce after the reset blocks as usual: the old streak no longer counts.
    h.transport.failNextWith(new PermanentSendError(ALIKE(9), 550));
    await testSend(draft.id, 'one9@example.com');
    expect((await suppressionsOf(W.id)).map((x) => x.email)).toEqual(['one9@example.com']);
  });

  it('re-entry: after a clear, five one-to-one mailings refused alike trip it again, at the fifth', async () => {
    const { s, draft } = await setup();
    await tripByTestSends(draft.id);
    await h.call({ method: 'POST', path: `/v1/providers/${s.provider.id}/clear-anomaly`, key: W.key });
    // The mailing that was sending is paused; the one-to-one mailings run on their own.
    for (let i = 0; i < 4; i++) {
      h.transport.failNextWith(new PermanentSendError(ALIKE(10 + i), 550));
      await onePerson(s, `solo${i}@example.com`);
    }
    expect((await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key })).body.rejections.anomaly).toBeNull();
    expect(await suppressionsOf(W.id)).toHaveLength(4);
    h.transport.failNextWith(new PermanentSendError(ALIKE(14), 550));
    await onePerson(s, 'solo4@example.com');
    const provider = await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key });
    expect(provider.body.rejections.anomaly).toMatchObject({ scope: 'provider', blocking: true });
    expect(await suppressionsOf(W.id)).toEqual([]);
  });

  it("tenancy: B cannot clear A's anomaly; a revoked key and a send-scoped key are refused", async () => {
    const { s, draft } = await setup();
    await tripByTestSends(draft.id);
    const B = await h.seedWorkspace('bounce-b3');
    const path = `/v1/providers/${s.provider.id}/clear-anomaly`;
    expect((await h.call({ method: 'POST', path, key: B.key })).status).toBe(404);
    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${minted.body.api_key.id}`, key: W.key });
    expect((await h.call({ method: 'POST', path, key: minted.body.key })).status).toBe(401);
    const send = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'send', scope: 'send' } });
    expect((await h.call({ method: 'POST', path, key: send.body.key })).status).toBe(403);
    expect((await h.call({ path: `/v1/providers/${s.provider.id}`, key: W.key })).body.rejections.anomaly.blocking).toBe(true);
  });
});
