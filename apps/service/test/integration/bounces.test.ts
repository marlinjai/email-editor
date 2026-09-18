import { randomBytes, randomUUID } from 'node:crypto';
import { Provider, WebhookEvent, type WebhookEventOf } from '@marlinjai/mail-contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { svixSign } from '../../src/provider-events/svix.js';
import { PermanentSendError } from '../../src/transport/index.js';
import { appOver } from '../support/app-call.js';
import { PUBLIC_BASE_URL, startHarness, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, drainUntilSettled, eventsOf, makeWorker, recipientsOf, seedContact, seedSending } from '../support/sending.js';

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
    expect(provider.body.rejections).toEqual({ count: 0, last_error: null, last_at: null });
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
    expect((await post(p.id, complaintEvent('re-x', 'cyd@example.com'))).body.outcome).toBe('suppressed');
    expect((await post(p.id, bounceEvent('re-y', 'dan@example.com'))).body.outcome).toBe('already_suppressed');
    const byEmail = new Map((await suppressionsOf(W.id)).map((s) => [s.email, s]));
    expect(byEmail.get('cyd@example.com')!.reason).toBe('complained');
    expect(byEmail.get('dan@example.com')).toMatchObject({ reason: 'manual', note: 'asked by phone' });
    expect((await bouncedEvents(W.id)).map((e) => e.data.email)).toEqual(['cyd@example.com']);
  });

  it('a bounce for an unknown message id still blocks the single address it names, without a source message', async () => {
    const p = await resendProvider(W.id);
    const eve = await repos(h.sql).contacts.insert(W.id, { email: 'eve@example.com', externalId: 'ext-eve' });
    const res = await post(p.id, bounceEvent('re-unknown', 'Eve@Example.com'));
    expect(res.body.outcome).toBe('suppressed');
    expect(await suppressionsOf(W.id)).toMatchObject([{ email: 'eve@example.com', reason: 'bounced', source_message_id: null }]);
    expect((await bouncedEvents(W.id))[0]!.data).toMatchObject({ contact_id: eve!.id, external_id: 'ext-eve', message_id: null });
  });

  it('an unknown message naming several addresses, a transient bounce and a delay are acknowledged and ignored', async () => {
    const p = await resendProvider(W.id);
    const several = { ...bounceEvent('re-many', 'a@example.com'), data: { ...bounceEvent('re-many', 'a@example.com').data, to: ['a@example.com', 'b@example.com'] } };
    for (const event of [
      several,
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
    const event = bounceEvent('re-3', 'x@example.com');
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

    // B's message id, sent to A's endpoint: A has no such message, B is untouched.
    const res = await post(pa.id, bounceEvent('re-b', 'shared@example.com'));
    expect(res.body.outcome).toBe('suppressed');
    expect(await suppressionsOf(W.id)).toMatchObject([{ email: 'shared@example.com', source_message_id: null }]);
    expect(await suppressionsOf(B.id)).toEqual([]);
    expect(await bouncedEvents(B.id)).toEqual([]);

    expect((await post(pa.id, bounceEvent('re-z', 'z@example.com'), { secret: secretB })).status).toBe(400);
    // The same svix-id at another provider is another event.
    expect((await post(pb.id, bounceEvent('re-b', 'shared@example.com'), { id: res.id, secret: secretB })).body.duplicate).toBe(false);
    expect(await suppressionsOf(B.id)).toHaveLength(1);
  });

  it('the suppressions list filters by the new reasons', async () => {
    const p = await resendProvider(W.id);
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
    expect(created.body.events).toEqual({ status: 'active', source: 'automatic', url, error: null });
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
    expect((await post(created.body.id, bounceEvent('re-9', 'h@example.com'))).status).toBe(200);

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
    expect((await post(created.body.id, bounceEvent('re-11', 'j@example.com'))).status).toBe(400);
    expect((await post(created.body.id, bounceEvent('re-11', 'j@example.com'), { secret: second })).status).toBe(200);

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
