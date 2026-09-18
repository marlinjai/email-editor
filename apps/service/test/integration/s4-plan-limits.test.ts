import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setExemption } from '../../src/billing/exempt.js';
import { createImportJob } from '../../src/imports/job.js';
import { createPurposeSigner } from '../../src/platform/tokens.js';
import { PlatformWorker } from '../../src/platform/worker.js';
import { repos } from '../../src/repo/index.js';
import { signupConfirmationJob } from '../../src/signup/mail-job.js';
import { PUBLIC_BASE_URL, startHarness, UNSUBSCRIBE_KEYS, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, makeWorker, seedContact, seedSending } from '../support/sending.js';

/**
 * The S5 plan limits on the S4 paths: A/B testing and tracking are plan
 * features, and the contacts a CSV import or a signup confirmation adds count
 * against the plan's contact limit. The free plan has neither feature and 500
 * contacts.
 */
let h: Harness;
type W = Awaited<ReturnType<Harness['seedWorkspace']>>;
let n = 0;
const quiet = { error: () => {}, log: () => {} };

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h?.drop());

const free = () => h.seedWorkspace(`limits-${++n}`, { billing: 'free' });
const AB = { variants: [{ key: 'a', subject: 'A' }, { key: 'b', subject: 'B' }], test_fraction: 0.5, winner_metric: 'manual' };

async function fillContacts(W: W, count: number) {
  await h.sql`
    INSERT INTO contacts (workspace_id, email)
    SELECT ${W.id}, 'filler' || g || '@example.com' FROM generate_series(1, ${count}) AS g`;
}

async function mailingWithRecipient(W: W) {
  const s = await seedSending(h, W.id);
  const c = await seedContact(h, W.id, s.topic.id, { email: `r${++n}@example.com` });
  const mailing = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id });
  await addRecipients(h, W, mailing.id, [{ contact_id: c.id }]);
  return { ...s, mailing };
}

describe('plan features', () => {
  it('the free plan refuses an A/B test and turning tracking on; turning it off always works', async () => {
    const W = await free();
    const { mailing } = await mailingWithRecipient(W);
    const ab = await h.call({ method: 'PUT', path: `/v1/mailings/${mailing.id}/ab-test`, key: W.key, body: AB });
    expect(ab.status).toBe(429);
    expect(ab.body.error).toMatchObject({ code: 'plan_limit_reached', details: { feature: 'ab_testing', plan: 'free' } });
    const on = await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: W.key, body: { opens: true, clicks: false } });
    expect(on.status).toBe(429);
    expect(on.body.error.details).toMatchObject({ feature: 'tracking' });
    const off = await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: W.key, body: { opens: false, clicks: false } });
    expect(off.status).toBe(200);
  });

  it('an A/B test set up under a plan with it cannot start after a move to one without', async () => {
    const W = await h.seedWorkspace(`limits-${++n}`);
    const { mailing } = await mailingWithRecipient(W);
    expect((await h.call({ method: 'PUT', path: `/v1/mailings/${mailing.id}/ab-test`, key: W.key, body: AB })).status).toBe(200);
    await setExemption(h.sql, W.id, false, 'test: back to the free plan');
    const send = await action(h, W, mailing.id, 'send');
    expect(send.status).toBe(429);
    expect(send.body.error.details).toMatchObject({ feature: 'ab_testing' });
  });

  it('tracking left on by a plan the workspace no longer has tracks nothing', async () => {
    const W = await h.seedWorkspace(`limits-${++n}`);
    const { mailing } = await mailingWithRecipient(W);
    expect((await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: W.key, body: { opens: true, clicks: true } })).status).toBe(200);
    await setExemption(h.sql, W.id, false, 'test: back to the free plan');
    expect((await action(h, W, mailing.id, 'send')).status).toBe(202);
    const transport = h.transport;
    const before = transport.sent.length;
    await makeWorker(h).drain();
    const html = transport.sent[before]!.html;
    expect(html).not.toContain('/t/o/');
    expect((await repos(h.sql).mailings.get(W.id, mailing.id))!.tracking).toEqual({ opens: false, clicks: false });
  });
});

describe('the contact limit', () => {
  it('stops a CSV import at the batch that would pass it, keeping the rows before', async () => {
    const W = await free();
    await repos(h.sql).topics.create(W.id, { slug: 'news', name: 'News', description: null, translations: {} });
    await fillContacts(W, 498);
    const form = new FormData();
    form.set('file', new File(['Email\na@new.test\nb@new.test\nc@new.test\n'], 'people.csv', { type: 'text/csv' }));
    const created = await h.call({ method: 'POST', path: '/v1/imports', key: W.key, form });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const mapped = await h.call({
      method: 'PUT',
      path: `/v1/imports/${id}/mapping`,
      key: W.key,
      body: { mapping: { Email: 'email' }, topics: ['news'], tags: [], consent_confirmed: true },
    });
    expect(mapped.status).toBe(202);
    const drain = () =>
      new PlatformWorker({ jobs: [createImportJob({ sql: h.sql, batchSize: 2, log: quiet })], log: quiet }).drain();
    await drain();
    const version = (await h.call({ path: `/v1/imports/${id}`, key: W.key })).body.mapping_version;
    expect((await h.call({ method: 'POST', path: `/v1/imports/${id}/commit`, key: W.key, body: { mapping_version: version } })).status).toBe(202);
    await drain();
    const job = (await h.call({ path: `/v1/imports/${id}`, key: W.key })).body;
    expect(job).toMatchObject({ status: 'failed', result: { created: 2 } });
    expect(job.error).toMatch(/contact limit/);
    const [row] = await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM contacts WHERE workspace_id = ${W.id}`;
    expect(row!.count).toBe(500);
    const [finished] = await h.sql`SELECT payload FROM webhook_events WHERE workspace_id = ${W.id} AND type = 'import.finished'`;
    expect(finished!.payload.data.status).toBe('failed');
  });

  it('a signup confirmation over the limit changes nothing and its link keeps working once there is room', async () => {
    const W = await free();
    const { provider } = await seedSending(h, W.id, { topic: 'news' });
    const created = await h.call({
      method: 'POST',
      path: '/v1/signup-forms',
      key: W.key,
      body: { name: 'N', title: 'Join', consent_text: 'I agree.', topics: ['news'], provider_id: provider.id },
    });
    expect(created.status).toBe(201);
    const formId = created.body.id as string;
    await fillContacts(W, 500);

    const token = createPurposeSigner(UNSUBSCRIBE_KEYS, 'signup-render').sign(`${formId}.${Date.now() - 10_000}`);
    const post = (path: string, body: Record<string, string>) =>
      h.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': `198.51.100.${++n}` },
        body: new URLSearchParams(body).toString(),
      });
    expect((await post(`/f/${formId}`, { email: 'late@example.com', form_token: token })).status).toBe(200);
    const job = signupConfirmationJob({ sql: h.sql, transportFor: () => h.transport, rootKeys: UNSUBSCRIBE_KEYS, publicBaseUrl: PUBLIC_BASE_URL, log: quiet });
    for (let i = 0; i < 20 && (await job.tick(new Date())); i++);
    const mail = [...h.transport.sent].reverse().find((m) => m.to[0] === 'late@example.com')!;
    const link = /\/f\/confirm\/([A-Za-z0-9._-]+)/.exec(mail.html)![1]!;

    const full = await post(`/f/confirm/${link}`, { lang: 'en' });
    expect(full.status).toBe(503);
    expect(await full.text()).toContain('cannot add new subscribers');
    expect(await repos(h.sql).contacts.byEmail(W.id, 'late@example.com')).toBeNull();

    await h.sql`DELETE FROM contacts WHERE workspace_id = ${W.id} AND email = 'filler1@example.com'`;
    const done = await post(`/f/confirm/${link}`, { lang: 'en' });
    expect(done.status).toBe(200);
    expect((await repos(h.sql).contacts.byEmail(W.id, 'late@example.com'))!.topics).toEqual(['news']);
  });
});
