import { WebhookEvent } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { startHarness, type Harness } from '../support/harness.js';

/**
 * Every path that clears an unsubscribe reports it, so a client mirror of
 * `contact.unsubscribed` can follow the person back in. The hosted page is
 * covered in unsubscribe.test.ts; this file covers the API and the dashboard
 * (`suppressions.delete`), and that lifting any other kind of block stays silent.
 */

let h: Harness;
let pool: ReturnType<typeof repos>;
beforeAll(async () => {
  h = await startHarness();
  pool = repos(h.sql);
});
afterAll(() => h?.drop());

let seq = 0;
async function scenario() {
  const ws = await h.seedWorkspace(`resub-${++seq}`);
  const topic = (await pool.topics.create(ws.id, { slug: 'programme-updates', name: 'Programme updates', description: null, translations: {} }))!;
  const contact = (await pool.contacts.insert(ws.id, { email: `p${seq}@example.com`, externalId: `ext-${seq}` }))!;
  return { ws, topic, contact };
}

async function events(workspaceId: string) {
  const rows = await h.sql<{ payload: unknown }[]>`
    SELECT payload FROM webhook_events WHERE workspace_id = ${workspaceId} ORDER BY created_at, id`;
  return rows.map((r) => WebhookEvent.parse(r.payload));
}

describe('suppressions.delete and contact.resubscribed', () => {
  it('lifting an unsubscribe through the API reports contact.resubscribed with source api', async () => {
    const s = await scenario();
    const created = await h.call({
      method: 'POST',
      path: '/v1/suppressions',
      key: s.ws.key,
      body: { email: s.contact.email, reason: 'unsubscribed', topic: 'programme-updates' },
    });
    expect(created.status).toBe(201);
    const lifted = await h.call({ method: 'DELETE', path: `/v1/suppressions/${created.body.id}`, key: s.ws.key });
    expect(lifted.status).toBe(200);

    const all = await events(s.ws.id);
    expect(all.map((e) => e.type)).toEqual(['contact.unsubscribed', 'contact.resubscribed']);
    expect(all[1]).toMatchObject({
      data: {
        contact_id: s.contact.id,
        external_id: s.contact.external_id,
        email: s.contact.email,
        topic: 'programme-updates',
        mailing_id: null,
        source: 'api',
      },
    });
  });

  it('a member lifting an all-topics unsubscribe in the dashboard reports source dashboard, even with no contact', async () => {
    const s = await scenario();
    const owner = { subject: s.ws.owner, workspace: s.ws.id };
    const created = await h.call({
      method: 'POST',
      path: '/v1/suppressions',
      ...owner,
      body: { email: 'nobody@example.com', reason: 'unsubscribed' },
    });
    expect(created.status).toBe(201);
    expect((await h.call({ method: 'DELETE', path: `/v1/suppressions/${created.body.id}`, ...owner })).status).toBe(200);
    const last = (await events(s.ws.id)).at(-1);
    expect(last).toMatchObject({
      type: 'contact.resubscribed',
      data: { contact_id: null, external_id: null, email: 'nobody@example.com', topic: null, source: 'dashboard' },
    });
  });

  it('lifting a manual or bounce block reports nothing', async () => {
    const s = await scenario();
    const manual = await h.call({ method: 'POST', path: '/v1/suppressions', key: s.ws.key, body: { email: s.contact.email, reason: 'manual' } });
    const { suppression: bounce } = await pool.suppressions.create(s.ws.id, {
      email: s.contact.email,
      reason: 'bounced',
      topicId: s.topic.id,
    });
    expect((await h.call({ method: 'DELETE', path: `/v1/suppressions/${manual.body.id}`, key: s.ws.key })).status).toBe(200);
    expect((await h.call({ method: 'DELETE', path: `/v1/suppressions/${bounce.id}`, key: s.ws.key })).status).toBe(200);
    expect(await events(s.ws.id)).toEqual([]);
  });

  it('another workspace cannot lift the block, and nothing is reported', async () => {
    const a = await scenario();
    const b = await scenario();
    const created = await h.call({ method: 'POST', path: '/v1/suppressions', key: a.ws.key, body: { email: a.contact.email, reason: 'unsubscribed' } });
    const before = await events(a.ws.id);
    expect((await h.call({ method: 'DELETE', path: `/v1/suppressions/${created.body.id}`, key: b.ws.key })).status).toBe(404);
    expect(await events(a.ws.id)).toEqual(before);
    expect(await events(b.ws.id)).toEqual([]);
  });
});
