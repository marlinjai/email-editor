import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { MemoryTransport } from '../../src/transport/index.js';
import { startHarness, type Harness } from '../support/harness.js';
import { newsletter } from '../support/mail-documents.js';
import {
  action,
  addRecipients,
  createMailing,
  eventsOf,
  mailingStatus,
  drainUntilSettled,
  makeWorker,
  recipientsOf,
  seedContact,
  seedSending,
} from '../support/sending.js';

/**
 * The mailing flow end to end, on the four paths of the stateful-flow standard:
 * forward, backtrack-and-revise, resume from persistence (crashes, the daily
 * budget, a restart), and re-entry after completion or failure. The worker runs
 * against a real Postgres; the provider is a MemoryTransport.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeEach(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('flow');
});
afterEach(() => h?.drop());

async function setup(opts: Parameters<typeof seedSending>[2] = {}, people = ['ada', 'bob', 'cyd']) {
  const s = await seedSending(h, W.id, opts);
  const contacts = [];
  for (const name of people) {
    contacts.push(
      await seedContact(h, W.id, s.topic.id, {
        email: `${name}@example.com`,
        first_name: name[0]!.toUpperCase() + name.slice(1),
        external_id: `ext-${name}`,
        properties: { city: 'Lisbon' },
      }),
    );
  }
  const mailing = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
  const added = await addRecipients(h, W, mailing.id, contacts.map((c) => ({ contact_id: c.id })));
  expect(added.body).toEqual({ added: people.length, already_present: 0, rejected: [] });
  return { ...s, contacts, mailing };
}

async function send(mailingId: string) {
  const res = await action(h, W, mailingId, 'send');
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  return res;
}

describe('forward', () => {
  it('three recipients get one personalised message each, with one-click unsubscribe headers', async () => {
    const { mailing, contacts, topic } = await setup();
    await send(mailing.id);
    await makeWorker(h).drain();

    expect(h.transport.sent).toHaveLength(3);
    const byTo = new Map(h.transport.sent.map((m) => [m.to[0], m]));
    for (const c of contacts) {
      const m = byTo.get(c.email)!;
      expect(m.to).toEqual([c.email]);
      expect(m.from).toEqual({ name: 'Studio', email: 'news@studio.test' });
      expect(m.replyTo).toBe('hello@studio.test');
      expect(m.subject).toBe(`News for ${c.first_name}`);
      expect(m.html).toContain(`Hello ${c.first_name}, Spring news from Lisbon.`);
      expect(m.html).not.toContain('{{');
      const url = /<(https:\/\/mail\.lumitra\.co\/u\/[^>]+)>/.exec(m.headers['List-Unsubscribe']!)![1]!;
      expect(m.headers['List-Unsubscribe']).toContain('<mailto:hello@studio.test?subject=unsubscribe>');
      expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(m.html).toContain(`href="${url}"`);
      const claims = h.signer.verify(url.split('/u/')[1]!)!;
      expect(claims).toMatchObject({ workspace_id: W.id, contact_id: c.id, mailing_id: mailing.id, topic_id: topic.id });
    }

    const recipients = await recipientsOf(h, W.id, mailing.id);
    expect(recipients.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
    expect(recipients.every((r) => r.attempts === 1 && r.message_id !== null)).toBe(true);

    // The archive holds the final HTML exactly as sent.
    const archived = await repos(h.sql).messages.get(W.id, recipients[0]!.message_id!);
    expect(archived!.html).toBe(byTo.get(archived!.to)!.html);
    expect(archived!.provider_message_id).toMatch(/^mem-/);

    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    const sentEvents = await eventsOf(h, W.id, 'message.sent');
    expect(sentEvents).toHaveLength(3);
    expect(sentEvents[0]!.payload.data).toMatchObject({
      mailing_id: mailing.id,
      mailing_metadata: { kind: 'newsletter' },
      topic: 'news',
      is_test: false,
    });
    expect(sentEvents.map((e) => e.payload.data.external_id).sort()).toEqual(['ext-ada', 'ext-bob', 'ext-cyd']);
    const finished = await eventsOf(h, W.id, 'mailing.finished');
    expect(finished).toHaveLength(1);
    expect(finished[0]!.payload.data).toMatchObject({ status: 'sent', counts: { total: 3, sent: 3, failed: 0, skipped: 0 } });
  });

  it('escapes every merge value in the HTML', async () => {
    const s = await seedSending(h, W.id);
    const c = await seedContact(h, W.id, s.topic.id, { email: 'eve@example.com', first_name: '<script>x</script>' });
    const mailing = await createMailing(h, W, { topic: 'news', provider_id: s.provider.id });
    await addRecipients(h, W, mailing.id, [{ contact_id: c.id, merge: { city: '"Tom" & Jerry' } }]);
    await send(mailing.id);
    await makeWorker(h).drain();
    const html = h.transport.sent[0]!.html;
    expect(html).toContain('Hello &lt;script&gt;x&lt;/script&gt;, Spring news from &quot;Tom&quot; &amp; Jerry.');
    expect(html).not.toContain('<script>x');
  });
});

describe('backtrack and revise', () => {
  it('an edit of the draft before send changes what is sent; after send, edits are refused', async () => {
    const { mailing } = await setup();
    const edited = await h.call({
      method: 'PATCH',
      path: `/v1/mailings/${mailing.id}`,
      key: W.key,
      body: { document: newsletter('Summer news'), subject: 'Summer for {{first_name}}' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe('draft');
    await send(mailing.id);

    const refused = await h.call({ method: 'PATCH', path: `/v1/mailings/${mailing.id}`, key: W.key, body: { subject: 'Too late' } });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('mailing_invalid_state');
    const noMore = await addRecipients(h, W, mailing.id, [{ email: 'late@example.com' }]);
    expect(noMore.status).toBe(409);

    await makeWorker(h).drain();
    expect(h.transport.sent).toHaveLength(3);
    for (const m of h.transport.sent) {
      expect(m.html).toContain('Summer news');
      expect(m.html).not.toContain('Spring news');
      expect(m.subject).toMatch(/^Summer for /);
    }
  });

  it('an edit that changes nothing keeps the draft, its recipients and its content', async () => {
    const { mailing } = await setup();
    const before = await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key });
    const same = await h.call({ method: 'PATCH', path: `/v1/mailings/${mailing.id}`, key: W.key, body: { subject: before.body.subject } });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ status: 'draft', subject: before.body.subject, document: before.body.document });
    expect(same.body.counts).toEqual(before.body.counts);
    expect(same.body.counts.queued).toBe(3);
  });
});

describe('resume from persistence', () => {
  it('a crash after the provider accepted ends outcome_unknown and is never sent twice', async () => {
    const { mailing } = await setup();
    await send(mailing.id);
    h.transport.failNext('crash');
    const worker = makeWorker(h);
    await worker.drain();
    await worker.drain();
    expect(h.transport.sent).toHaveLength(3);
    expect(new Set(h.transport.sent.map((m) => m.to[0])).size).toBe(3);
    const unknown = (await recipientsOf(h, W.id, mailing.id)).filter((r) => r.status === 'skipped');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ skip_reason: 'outcome_unknown', attempts: 1, message_id: null });
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('partially_failed');
  });

  it('a worker that died mid-send is reconciled: no archived message means outcome_unknown, never a re-send', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    // The claim commits, then the process dies before anything is recorded.
    const claimed = await repos(h.sql).recipients.claimNext(W.id, mailing.id);
    await h.sql`UPDATE mailing_recipients SET claimed_at = now() - interval '1 hour' WHERE id = ${claimed!.id}`;
    const worker = makeWorker(h);
    expect(await worker.reconcile()).toBe(1);
    await worker.drain();
    expect(h.transport.sent).toHaveLength(0);
    const [r] = await recipientsOf(h, W.id, mailing.id);
    expect(r).toMatchObject({ status: 'skipped', skip_reason: 'outcome_unknown' });
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('partially_failed');
    expect(await eventsOf(h, W.id, 'mailing.finished')).toHaveLength(1);
  });

  it('a stuck row with an archived message for its claim is reconciled as sent', async () => {
    const { mailing, provider, contacts } = await setup(undefined, ['ada']);
    await send(mailing.id);
    const r = repos(h.sql);
    const claimed = (await r.recipients.claimNext(W.id, mailing.id))!;
    await r.messages.insert(W.id, {
      mailingId: mailing.id,
      recipientId: claimed.id,
      contactId: contacts[0]!.id,
      to: claimed.email,
      subject: 's',
      html: '<p>sent</p>',
      providerId: provider.id,
      providerMessageId: 'mem-x',
      outcome: 'sent',
      error: null,
      isTest: false,
      recipientCount: 1,
    });
    await h.sql`UPDATE mailing_recipients SET claimed_at = now() - interval '1 hour' WHERE id = ${claimed.id}`;
    expect(await makeWorker(h).reconcile()).toBe(1);
    const [row] = await recipientsOf(h, W.id, mailing.id);
    expect(row).toMatchObject({ status: 'sent' });
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('a live send is never reconciled away (younger than stuckAfterMs)', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    await repos(h.sql).recipients.claimNext(W.id, mailing.id);
    expect(await makeWorker(h).reconcile()).toBe(0);
  });

  it('a failure before the provider took the message is sent again, exactly once', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    h.transport.failNext('transient', 2);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    expect(h.transport.attempts).toHaveLength(3);
    expect(h.transport.sent).toHaveLength(1);
    const [r] = await recipientsOf(h, W.id, mailing.id);
    expect(r).toMatchObject({ status: 'sent', attempts: 3 });
    // The two refused attempts gave their budget back: one recipient counted.
    const usage = await h.sql<{ n: number }[]>`SELECT coalesce(sum(recipients), 0)::int AS n FROM provider_sends WHERE workspace_id = ${W.id}`;
    expect(usage[0]!.n).toBe(1);
  });

  it('budget exhaustion mid-mailing waits for the window and resumes without losing anyone', async () => {
    const { mailing } = await setup({ policy: { daily_recipient_budget: 2 } });
    await send(mailing.id);
    const worker = makeWorker(h);
    await worker.drain();
    expect(h.transport.sent).toHaveLength(2);
    let rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.map((r) => r.status).sort()).toEqual(['queued', 'sent', 'sent']);
    // Nothing failed, and the waiting recipient was never counted as an attempt.
    expect(rows.find((r) => r.status === 'queued')!.attempts).toBe(0);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sending');
    const pass = await worker.runOnce();
    expect(pass.worked).toBe(false);
    expect(pass.nextWakeAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

    // A day later the window has room again.
    await h.sql`UPDATE provider_sends SET created_at = created_at - interval '25 hours' WHERE workspace_id = ${W.id}`;
    const later = makeWorker(h);
    await later.drain();
    expect(h.transport.sent).toHaveLength(3);
    rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('a process restart continues where the last one stopped', async () => {
    const { mailing } = await setup(undefined, ['ada', 'bob', 'cyd', 'dan']);
    await send(mailing.id);
    const first = makeWorker(h);
    await first.runOnce();
    await first.stop();
    expect(h.transport.sent).toHaveLength(1);
    const second = makeWorker(h);
    await second.drain();
    expect(h.transport.sent).toHaveLength(4);
    expect(new Set(h.transport.sent.map((m) => m.to[0])).size).toBe(4);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('stop() lets the send in flight finish and record, and starts no other', async () => {
    const { mailing } = await setup(undefined, ['ada', 'bob']);
    await send(mailing.id);
    const slow = new MemoryTransport();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = slow.send.bind(slow);
    slow.send = async (m) => {
      await gate;
      return original(m);
    };
    const worker = makeWorker(h, slow);
    worker.start();
    // Wait until the first message is out with the provider (claimed, not settled).
    while (!(await recipientsOf(h, W.id, mailing.id)).some((r) => r.status === 'sending')) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const stopped = worker.stop();
    release();
    await stopped;
    expect(slow.sent).toHaveLength(1);
    const rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.map((r) => r.status).sort()).toEqual(['queued', 'sent']);
  });
});

describe('re-entry after completion or failure', () => {
  it('retry-failed after a partial failure sends only the failed ones, and finishes again once', async () => {
    const { mailing } = await setup();
    await send(mailing.id);
    h.transport.failNext('permanent');
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('partially_failed');
    const failed = await eventsOf(h, W.id, 'message.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload.data).toMatchObject({ retryable: false, is_test: false });

    const retried = await action(h, W, mailing.id, 'retry-failed');
    expect(retried.status).toBe(202);
    expect(retried.body).toMatchObject({ status: 'sending', finished_at: null });
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    expect(h.transport.sent).toHaveLength(3);
    const finished = await eventsOf(h, W.id, 'mailing.finished');
    expect(finished.map((e) => e.payload.data.status)).toEqual(['partially_failed', 'sent']);
  });

  it('transient failures past three retries fail the recipient as retryable', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    h.transport.failNext('transient', 4);
    await drainUntilSettled(h, makeWorker(h), W.id, mailing.id);
    const [r] = await recipientsOf(h, W.id, mailing.id);
    expect(r).toMatchObject({ status: 'failed', attempts: 4 });
    const [event] = await eventsOf(h, W.id, 'message.failed');
    expect(event!.payload.data.retryable).toBe(true);
  });

  it('retry-failed leaves outcome_unknown alone unless asked, then requeues it', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    h.transport.failNext('crash');
    await makeWorker(h).drain();
    const plain = await action(h, W, mailing.id, 'retry-failed');
    expect(plain.status).toBe(422);
    expect(plain.body.error.code).toBe('mailing_not_ready');
    const asked = await action(h, W, mailing.id, 'retry-failed', { include_outcome_unknown: true });
    expect(asked.status).toBe(202);
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('cancel stops sending: the rest is skipped, nothing more goes out', async () => {
    const { mailing } = await setup(undefined, ['ada', 'bob', 'cyd']);
    await send(mailing.id);
    const worker = makeWorker(h);
    await worker.runOnce();
    const cancelled = await action(h, W, mailing.id, 'cancel');
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    await worker.drain();
    expect(h.transport.sent).toHaveLength(1);
    const rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.filter((r) => r.skip_reason === 'cancelled')).toHaveLength(2);
    const finished = await eventsOf(h, W.id, 'mailing.finished');
    expect(finished).toHaveLength(1);
    expect(finished[0]!.payload.data).toMatchObject({ status: 'cancelled', counts: { sent: 1, skipped: 2 } });
  });

  it('pause holds the queue between sends, resume carries on', async () => {
    const { mailing } = await setup();
    await send(mailing.id);
    const worker = makeWorker(h);
    await worker.runOnce();
    expect((await action(h, W, mailing.id, 'pause')).body.status).toBe('paused');
    await worker.drain();
    expect(h.transport.sent).toHaveLength(1);
    const resumed = await action(h, W, mailing.id, 'resume');
    expect(resumed.status).toBe(202);
    await worker.drain();
    expect(h.transport.sent).toHaveLength(3);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('a finished mailing is immutable; every other action is mailing_invalid_state', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    for (const [name, body] of [['send', {}], ['pause', {}], ['resume', {}], ['cancel', {}], ['retry-failed', {}]] as const) {
      const res = await action(h, W, mailing.id, name, body);
      expect(res.status, name).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'mailing_invalid_state', details: { status: 'sent' } });
    }
    expect((await h.call({ method: 'PATCH', path: `/v1/mailings/${mailing.id}`, key: W.key, body: { name: 'x' } })).status).toBe(409);
    expect((await addRecipients(h, W, mailing.id, [{ email: 'new@example.com' }])).status).toBe(409);
  });

  it('a duplicate of a sent mailing is a new, editable draft with the same content and no recipients', async () => {
    const { mailing } = await setup(undefined, ['ada']);
    await send(mailing.id);
    await makeWorker(h).drain();
    const copy = await action(h, W, mailing.id, 'duplicate');
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({
      status: 'draft',
      subject: mailing.subject,
      topic: 'news',
      provider_id: mailing.provider_id,
      metadata: mailing.metadata,
      counts: { total: 0 },
      started_at: null,
      finished_at: null,
    });
    expect(copy.body.id).not.toBe(mailing.id);
    expect(copy.body.document).toEqual(mailing.document);
    const edit = await h.call({ method: 'PATCH', path: `/v1/mailings/${copy.body.id}`, key: W.key, body: { name: 'Again' } });
    expect(edit.status).toBe(200);
  });

  it('a person who unsubscribed, was suppressed or erased after queueing is skipped with the reason', async () => {
    const { mailing, contacts, topic } = await setup(undefined, ['ada', 'bob', 'cyd', 'dan']);
    await send(mailing.id);
    const r = repos(h.sql);
    await r.contacts.unsubscribe(W.id, contacts[0]!.id, topic.id);
    await r.suppressions.create(W.id, { email: contacts[1]!.email, reason: 'unsubscribed', topicId: topic.id });
    await r.suppressions.create(W.id, { email: contacts[2]!.email, reason: 'bounced', topicId: null });
    await makeWorker(h).drain();
    expect(h.transport.sent.map((m) => m.to[0])).toEqual(['dan@example.com']);
    const reasons = Object.fromEntries((await recipientsOf(h, W.id, mailing.id)).map((x) => [x.email, x.skip_reason]));
    expect(reasons).toEqual({
      'ada@example.com': 'not_subscribed',
      'bob@example.com': 'suppressed',
      'cyd@example.com': 'suppressed',
      'dan@example.com': null,
    });
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('an erased contact is skipped as contact_erased', async () => {
    const { mailing, contacts } = await setup(undefined, ['ada']);
    await send(mailing.id);
    await repos(h.sql).contacts.delete(W.id, contacts[0]!.id);
    await makeWorker(h).drain();
    expect(h.transport.sent).toHaveLength(0);
    const [row] = await recipientsOf(h, W.id, mailing.id);
    expect(row).toMatchObject({ status: 'skipped', skip_reason: 'contact_erased' });
  });
});

describe('suppression and concurrency', () => {
  it('suppression is enforced whatever the client pushed', async () => {
    const s = await seedSending(h, W.id);
    await repos(h.sql).suppressions.create(W.id, { email: 'blocked@example.com', reason: 'complained', topicId: null });
    const mailing = await createMailing(h, W, { topic: 'news', provider_id: s.provider.id });
    // A new address: the service creates the contact (subscribed to the topic), the block still wins.
    const added = await addRecipients(h, W, mailing.id, [{ email: 'Blocked@Example.com' }, { email: 'ok@example.com' }]);
    expect(added.body).toMatchObject({ added: 2 });
    await send(mailing.id);
    await makeWorker(h).drain();
    expect(h.transport.sent.map((m) => m.to[0])).toEqual(['ok@example.com']);
  });

  it('two workers never send twice and hold the provider interval between them', async () => {
    const people = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const { mailing } = await setup({ policy: { min_interval_ms: 60 } }, people);
    await send(mailing.id);
    const a = makeWorker(h);
    const b = makeWorker(h);
    await Promise.all([a.drain({ waitUpToMs: 1_000 }), b.drain({ waitUpToMs: 1_000 })]);
    expect(h.transport.sent).toHaveLength(8);
    expect(new Set(h.transport.sent.map((m) => m.to[0])).size).toBe(8);
    const ledger = await h.sql<{ at: string }[]>`
      SELECT created_at AS at FROM provider_sends WHERE workspace_id = ${W.id} ORDER BY created_at`;
    for (let i = 1; i < ledger.length; i++) {
      const gap = new Date(ledger[i]!.at).getTime() - new Date(ledger[i - 1]!.at).getTime();
      expect(gap).toBeGreaterThanOrEqual(59);
    }
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    expect(await eventsOf(h, W.id, 'mailing.finished')).toHaveLength(1);
  });
});
