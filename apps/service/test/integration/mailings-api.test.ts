import { ErrorBody, routes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { startHarness, type Harness } from '../support/harness.js';
import { brokenSpacer, invalidForCore, newsletter, withoutUnsubscribe } from '../support/mail-documents.js';
import { action, addRecipients, createMailing, eventsOf, makeWorker, seedContact, seedSending } from '../support/sending.js';

/**
 * The mailing and message routes: validation, the recipient batch, the test
 * send, tenancy, and conformance with the contract's route table.
 */
let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;
let sA: Awaited<ReturnType<typeof seedSending>>;
let sB: Awaited<ReturnType<typeof seedSending>>;
beforeAll(async () => {
  h = await startHarness();
  A = await h.seedWorkspace('api-a');
  B = await h.seedWorkspace('api-b');
  sA = await seedSending(h, A.id);
  sB = await seedSending(h, B.id);
});
afterAll(() => h?.drop());

const OWNED: OperationId[] = [
  'mailings.list',
  'mailings.create',
  'mailings.get',
  'mailings.update',
  'mailings.addRecipients',
  'mailings.listRecipients',
  'mailings.test',
  'mailings.send',
  'mailings.pause',
  'mailings.resume',
  'mailings.cancel',
  'mailings.retryFailed',
  'mailings.duplicate',
  'messages.list',
  'messages.get',
];

function conforms(id: OperationId, res: { status: number; body: unknown }) {
  expect(res.status, `${id}: ${JSON.stringify(res.body)}`).toBe(routes[id].status);
  const parsed = routes[id].response.safeParse(res.body);
  expect(parsed.success, `${id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
}

describe('contract conformance, mailings and messages', () => {
  it('every owned operation answers with its declared status and response schema', async () => {
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: any }) => {
      conforms(id, res);
      covered.add(id);
      return res;
    };
    const c = await seedContact(h, A.id, sA.topic.id, { email: 'conform@example.com', first_name: 'Con' });
    const m = await run('mailings.create', await h.call({ method: 'POST', path: '/v1/mailings', key: A.key, body: { subject: 'S', topic: 'news', provider_id: sA.provider.id, document: newsletter() } }));
    const id = m.body.id;
    await run('mailings.list', await h.call({ path: '/v1/mailings?limit=5', key: A.key }));
    await run('mailings.get', await h.call({ path: `/v1/mailings/${id}`, key: A.key }));
    await run('mailings.update', await h.call({ method: 'PATCH', path: `/v1/mailings/${id}`, key: A.key, body: { name: 'Conform' } }));
    await run('mailings.addRecipients', await addRecipients(h, A, id, [{ contact_id: c.id }]));
    await run('mailings.listRecipients', await h.call({ path: `/v1/mailings/${id}/recipients`, key: A.key }));
    const test = await run('mailings.test', await action(h, A, id, 'test', { to: 'me@studio.test' }));
    await run('mailings.send', await action(h, A, id, 'send'));
    await run('mailings.pause', await action(h, A, id, 'pause'));
    await run('mailings.resume', await action(h, A, id, 'resume'));
    h.transport.failNext('permanent');
    await makeWorker(h).drain();
    await run('mailings.retryFailed', await action(h, A, id, 'retry-failed'));
    await run('mailings.cancel', await action(h, A, id, 'cancel'));
    await run('mailings.duplicate', await action(h, A, id, 'duplicate'));
    await run('messages.list', await h.call({ path: `/v1/messages?mailing_id=${id}`, key: A.key }));
    await run('messages.get', await h.call({ path: `/v1/messages/${test.body.message_id}`, key: A.key }));
    expect([...covered].sort()).toEqual([...OWNED].sort());
  });

  it('every owned route is mounted at its method and path', async () => {
    for (const id of OWNED) {
      const def = routes[id];
      const res = await h.call({
        method: def.method,
        path: def.path.replace(':id', '00000000-0000-4000-8000-000000000000'),
        key: A.key,
        body: def.method === 'GET' ? undefined : {},
      });
      expect(String(res.body.error?.message ?? ''), id).not.toMatch(/^No route for/);
      if (res.status >= 400) expect(ErrorBody.safeParse(res.body).success, id).toBe(true);
    }
  });
});

describe('creating and sending: refusals', () => {
  it('refuses an unknown topic, provider or template, and a document the editor core rejects', async () => {
    const base = { subject: 'S', document: newsletter() };
    const topic = await h.call({ method: 'POST', path: '/v1/mailings', key: A.key, body: { ...base, topic: 'nope', provider_id: sA.provider.id } });
    expect(topic.body.error.code).toBe('unknown_topic');
    const provider = await h.call({ method: 'POST', path: '/v1/mailings', key: A.key, body: { ...base, topic: 'news', provider_id: sB.provider.id } });
    expect(provider.body.error.code).toBe('unknown_provider');
    const template = await h.call({
      method: 'POST',
      path: '/v1/mailings',
      key: A.key,
      body: { subject: 'S', topic: 'news', provider_id: sA.provider.id, template_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(template.status).toBe(404);
    const invalid = await h.call({ method: 'POST', path: '/v1/mailings', key: A.key, body: { ...base, document: invalidForCore(), topic: 'news', provider_id: sA.provider.id } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('validation_failed');
  });

  it("snapshots a saved template's current document, and B cannot use A's template", async () => {
    const saved = await h.call({ method: 'POST', path: '/v1/templates', key: A.key, body: { name: 'Spring', document: newsletter('From a template') } });
    expect(saved.status).toBe(201);
    const m = await h.call({ method: 'POST', path: '/v1/mailings', key: A.key, body: { subject: 'S', topic: 'news', provider_id: sA.provider.id, template_id: saved.body.id } });
    expect(m.status).toBe(201);
    expect(m.body.template_id).toBe(saved.body.id);
    expect(JSON.stringify(m.body.document)).toContain('From a template');
    const cross = await h.call({ method: 'POST', path: '/v1/mailings', key: B.key, body: { subject: 'S', topic: 'news', provider_id: sB.provider.id, template_id: saved.body.id } });
    expect(cross.status).toBe(404);
  });

  it('refuses to send without {{unsubscribe_url}}, with a broken document, or without recipients', async () => {
    const c = await seedContact(h, A.id, sA.topic.id, { email: 'refuse@example.com' });
    const noLink = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id, document: withoutUnsubscribe() });
    await addRecipients(h, A, noLink.id, [{ contact_id: c.id }]);
    const r1 = await action(h, A, noLink.id, 'send');
    expect(r1.status).toBe(422);
    expect(r1.body.error).toMatchObject({ code: 'missing_unsubscribe_url', details: { missing: ['unsubscribe_url'] } });

    const broken = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id, document: brokenSpacer() });
    await addRecipients(h, A, broken.id, [{ contact_id: c.id }]);
    const r2 = await action(h, A, broken.id, 'send');
    expect(r2.status).toBe(422);
    expect(r2.body.error.code).toBe('compile_failed');
    expect(r2.body.error.details.errors.length).toBeGreaterThan(0);

    const empty = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    const r3 = await action(h, A, empty.id, 'send');
    expect(r3.status).toBe(422);
    expect(r3.body.error.code).toBe('mailing_not_ready');
    // Every refusal left the mailing a draft.
    for (const m of [noLink, broken, empty]) {
      expect((await h.call({ path: `/v1/mailings/${m.id}`, key: A.key })).body.status).toBe('draft');
    }
  });

  it('refuses a send when the provider was deleted after the draft was made', async () => {
    const s = await seedSending(h, A.id, { topic: 'gone' });
    const c = await seedContact(h, A.id, s.topic.id, { email: 'gone@example.com' });
    const m = await createMailing(h, A, { topic: 'gone', provider_id: s.provider.id });
    await addRecipients(h, A, m.id, [{ contact_id: c.id }]);
    await repos(h.sql).providers.softDelete(A.id, s.provider.id);
    const res = await action(h, A, m.id, 'send');
    expect(res.body.error.code).toBe('unknown_provider');
  });

  it('draft actions follow MAILING_TRANSITIONS: a draft cannot pause, resume or retry', async () => {
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    for (const name of ['pause', 'resume', 'retry-failed']) {
      const res = await action(h, A, m.id, name);
      expect(res.status, name).toBe(409);
      expect(res.body.error.code).toBe('mailing_invalid_state');
    }
    const cancelled = await action(h, A, m.id, 'cancel');
    expect(cancelled.body.status).toBe('cancelled');
    // Cancelling a draft reports nothing: it never started.
    const finished = (await eventsOf(h, A.id, 'mailing.finished')).filter((e) => e.payload.data.mailing_id === m.id);
    expect(finished).toHaveLength(0);
  });
});

describe('the recipient batch', () => {
  it('is idempotent on the address and names what it rejected', async () => {
    const known = await seedContact(h, A.id, sA.topic.id, { email: 'known@example.com', external_id: 'crm-1' });
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    const first = await addRecipients(h, A, m.id, [
      { contact_id: known.id, merge: { first_name: 'K' } },
      { external_id: 'crm-1' },
      { email: 'New@Example.com' },
      { contact_id: '00000000-0000-4000-8000-000000000000' },
      { external_id: 'unknown-crm' },
      { contact_id: 'not-a-uuid' },
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      added: 2,
      already_present: 0,
      rejected: [
        { index: 1, reason: 'duplicate_in_batch' },
        { index: 3, reason: 'unknown_contact' },
        { index: 4, reason: 'unknown_contact' },
        { index: 5, reason: 'unknown_contact' },
      ],
    });
    const again = await addRecipients(h, A, m.id, [{ email: 'known@example.com' }, { email: 'new@example.com' }]);
    expect(again.body).toEqual({ added: 0, already_present: 2, rejected: [] });

    // The new address became a contact subscribed to the mailing's topic.
    const created = await repos(h.sql).contacts.byEmail(A.id, 'new@example.com');
    expect(created?.topics).toEqual(['news']);
    const listed = await h.call({ path: `/v1/mailings/${m.id}/recipients?limit=1`, key: A.key });
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].merge).toEqual({ first_name: 'K' });
    const next = await h.call({ path: `/v1/mailings/${m.id}/recipients?limit=1&cursor=${listed.body.next_cursor}`, key: A.key });
    expect(next.body.data[0].email).toBe('new@example.com');
    expect(next.body.next_cursor).toBeNull();
  });

  it('refuses more than 1000 recipients in one batch', async () => {
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    const many = Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@example.com` }));
    const res = await addRecipients(h, A, m.id, many);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('takes a full batch of 1000 in one call', async () => {
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    const many = Array.from({ length: 1000 }, (_, i) => ({ email: `bulk${i}@example.com` }));
    const res = await addRecipients(h, A, m.id, many);
    expect(res.body).toEqual({ added: 1000, already_present: 0, rejected: [] });
  }, 60_000);
});

describe('the test send', () => {
  it('sends one marked test message, archives it, counts it, and touches no recipient', async () => {
    const before = h.transport.sent.length;
    await seedContact(h, A.id, sA.topic.id, { email: 'owner@studio.test', first_name: 'Olga' });
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    const usage = async () =>
      (await h.sql<{ n: number }[]>`SELECT coalesce(sum(recipients),0)::int AS n FROM provider_sends WHERE provider_id = ${sA.provider.id}`)[0]!.n;
    const spent = await usage();
    const res = await action(h, A, m.id, 'test', { to: 'Owner@Studio.test', merge: { city: 'Porto' } });
    expect(res.status).toBe(200);
    expect(h.transport.sent).toHaveLength(before + 1);
    const sent = h.transport.sent.at(-1)!;
    expect(sent.to).toEqual(['owner@studio.test']);
    expect(sent.html).toContain('Hello Olga, Spring news from Porto.');
    expect(sent.headers['X-Lumitra-Test']).toMatch(/^[0-9a-f-]{36}$/);
    const token = /\/u\/([^>]+)>/.exec(sent.headers['List-Unsubscribe']!)![1]!;
    expect(h.signer.verify(token)).toMatchObject({ contact_id: 'test', mailing_id: m.id, topic_id: sA.topic.id });

    const archived = await h.call({ path: `/v1/messages/${res.body.message_id}`, key: A.key });
    expect(archived.body).toMatchObject({ is_test: true, recipient_id: null, mailing_id: m.id, outcome: 'sent', html: sent.html });
    expect(await usage()).toBe(spent + 1);
    const mailing = await h.call({ path: `/v1/mailings/${m.id}`, key: A.key });
    expect(mailing.body).toMatchObject({ status: 'draft', counts: { total: 0 } });
  });

  it('is refused when the daily budget is used up, and reports the provider refusing', async () => {
    const s = await seedSending(h, A.id, { topic: 'tight', policy: { daily_recipient_budget: 1 } });
    const m = await createMailing(h, A, { topic: 'tight', provider_id: s.provider.id });
    h.transport.failNext('permanent');
    const refused = await action(h, A, m.id, 'test', { to: 'me@studio.test' });
    expect(refused.status).toBe(502);
    expect(refused.body.error).toMatchObject({ code: 'provider_error', details: { retryable: false } });
    const failed = await h.call({ path: `/v1/messages/${refused.body.error.details.message_id}`, key: A.key });
    expect(failed.body).toMatchObject({ outcome: 'failed', is_test: true });

    const full = await action(h, A, m.id, 'test', { to: 'me@studio.test' });
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe('daily_budget_exhausted');
    expect(full.body.error.details.retry_after).toBeDefined();
  });

  it('gives the budget back when the provider did not take the message', async () => {
    const s = await seedSending(h, A.id, { topic: 'flaky', policy: { daily_recipient_budget: 1 } });
    const m = await createMailing(h, A, { topic: 'flaky', provider_id: s.provider.id });
    h.transport.failNext('transient');
    const res = await action(h, A, m.id, 'test', { to: 'me@studio.test' });
    expect(res.status).toBe(502);
    expect(res.body.error.details.retryable).toBe(true);
    expect((await action(h, A, m.id, 'test', { to: 'me@studio.test' })).status).toBe(200);
  });
});

describe('tenancy', () => {
  it("workspace B can neither read nor change workspace A's mailings and messages", async () => {
    const c = await seedContact(h, A.id, sA.topic.id, { email: 'tenant@example.com' });
    const m = await createMailing(h, A, { topic: 'news', provider_id: sA.provider.id });
    await addRecipients(h, A, m.id, [{ contact_id: c.id }]);
    const test = await action(h, A, m.id, 'test', { to: 'tenant@example.com' });

    expect((await h.call({ path: `/v1/mailings/${m.id}`, key: B.key })).status).toBe(404);
    expect((await h.call({ method: 'PATCH', path: `/v1/mailings/${m.id}`, key: B.key, body: { name: 'x' } })).status).toBe(404);
    expect((await h.call({ path: `/v1/mailings/${m.id}/recipients`, key: B.key })).status).toBe(404);
    for (const name of ['send', 'pause', 'resume', 'cancel', 'retry-failed', 'duplicate']) {
      expect((await action(h, B, m.id, name)).status, name).toBe(404);
    }
    expect((await action(h, B, m.id, 'test', { to: 'x@example.com' })).status).toBe(404);
    expect((await addRecipients(h, B, m.id, [{ email: 'x@example.com' }])).status).toBe(404);
    expect((await h.call({ path: `/v1/messages/${test.body.message_id}`, key: B.key })).status).toBe(404);
    const listB = await h.call({ path: `/v1/messages?mailing_id=${m.id}`, key: B.key });
    expect(listB.body.data).toEqual([]);
    const mailingsB = await h.call({ path: '/v1/mailings', key: B.key });
    expect(mailingsB.body.data.map((x: any) => x.id)).not.toContain(m.id);
    // B's contact cannot be put on B's mailing through A's contact id either.
    const mB = await createMailing(h, B, { topic: 'news', provider_id: sB.provider.id });
    const cross = await addRecipients(h, B, mB.id, [{ contact_id: c.id }]);
    expect(cross.body.rejected).toEqual([{ index: 0, reason: 'unknown_contact' }]);
    expect((await h.call({ path: `/v1/mailings/${m.id}`, key: A.key })).body.status).toBe('draft');
  });

  it('a revoked key is refused', async () => {
    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${minted.body.api_key.id}`, key: A.key });
    const res = await h.call({ path: '/v1/mailings', key: minted.body.key });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('api_key_revoked');
    const create = await h.call({ method: 'POST', path: '/v1/mailings', key: minted.body.key, body: { subject: 'S', topic: 'news', provider_id: sA.provider.id, document: newsletter() } });
    expect(create.status).toBe(401);
  });

  it('a read-scoped key can list but not create or send', async () => {
    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'reader', scope: 'read' } });
    expect((await h.call({ path: '/v1/mailings', key: minted.body.key })).status).toBe(200);
    const create = await h.call({ method: 'POST', path: '/v1/mailings', key: minted.body.key, body: { subject: 'S', topic: 'news', provider_id: sA.provider.id, document: newsletter() } });
    expect(create.status).toBe(403);
  });
});

describe('lists', () => {
  it('filters mailings by status and topic and pages them newest first', async () => {
    const list = await h.call({ path: '/v1/mailings?status=draft&topic=news&limit=2', key: A.key });
    expect(list.status).toBe(200);
    expect(list.body.data.every((m: any) => m.status === 'draft' && m.topic === 'news')).toBe(true);
    expect(list.body.data[0].document).toBeUndefined();
    const unknownTopic = await h.call({ path: '/v1/mailings?topic=no-such-topic', key: A.key });
    expect(unknownTopic.body).toEqual({ data: [], next_cursor: null });
    const badCursor = await h.call({ path: '/v1/mailings?cursor=00000000-0000-4000-8000-000000000000', key: A.key });
    expect(badCursor.body.error.code).toBe('invalid_cursor');
  });

  it('filters messages by outcome', async () => {
    const failed = await h.call({ path: '/v1/messages?outcome=failed', key: A.key });
    expect(failed.body.data.length).toBeGreaterThan(0);
    expect(failed.body.data.every((m: any) => m.outcome === 'failed' && m.html === undefined)).toBe(true);
  });
});
