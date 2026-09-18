import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';

/**
 * Tags on contacts and typed contact properties, including the tenancy of
 * every route: workspace A acts, aims at B, and never reads or changes B's rows;
 * a revoked key is refused on each route.
 */
let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;

beforeAll(async () => {
  h = await startHarness();
  A = await h.seedWorkspace('tags-a');
  B = await h.seedWorkspace('tags-b');
});
afterAll(() => h?.drop());

async function contact(key: string, email: string, properties?: Record<string, unknown>) {
  const res = await h.call({ method: 'POST', path: '/v1/contacts', key, body: { email, properties } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.contact as { id: string; tags: string[] };
}

describe('tags', () => {
  it('lives through create, assign, unassign and delete, idempotently and audited', async () => {
    const ada = await contact(A.key, 'ada@a.de');
    const bob = await contact(A.key, 'bob@a.de');
    const created = await h.call({ method: 'POST', path: '/v1/tags', key: A.key, body: { slug: 'founders', name: 'Founders' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: 'founders', contact_count: 0 });
    const dup = await h.call({ method: 'POST', path: '/v1/tags', key: A.key, body: { slug: 'founders', name: 'Again' } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('already_exists');

    const tagPath = `/v1/tags/${created.body.id}/contacts`;
    const assigned = await h.call({ method: 'POST', path: tagPath, key: A.key, body: { contact_ids: [ada.id, bob.id, 'not-an-id'] } });
    expect(assigned.status).toBe(200);
    expect(assigned.body.contact_count).toBe(2);
    const again = await h.call({ method: 'POST', path: tagPath, key: A.key, body: { contact_ids: [ada.id] } });
    expect(again.body.contact_count).toBe(2);

    const read = await h.call({ path: `/v1/contacts/${ada.id}`, key: A.key });
    expect(read.body.tags).toEqual(['founders']);

    const removed = await h.call({ method: 'DELETE', path: tagPath, key: A.key, body: { contact_ids: [bob.id, bob.id] } });
    expect(removed.status).toBe(200);
    expect(removed.body.contact_count).toBe(1);
    const removedAgain = await h.call({ method: 'DELETE', path: tagPath, key: A.key, body: { contact_ids: [bob.id] } });
    expect(removedAgain.body.contact_count).toBe(1);

    const list = await h.call({ path: '/v1/tags', key: A.key });
    expect(list.body.data.map((t: { slug: string }) => t.slug)).toEqual(['founders']);

    expect((await h.call({ method: 'DELETE', path: `/v1/tags/${created.body.id}`, key: A.key })).status).toBe(200);
    expect((await h.call({ path: `/v1/contacts/${ada.id}`, key: A.key })).body.tags).toEqual([]);
    expect((await h.call({ method: 'DELETE', path: `/v1/tags/${created.body.id}`, key: A.key })).status).toBe(404);

    const audit = await h.call({ path: `/v1/audit-log?target_id=${created.body.id}`, key: A.key });
    // A repeat that changed nothing writes no audit row.
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual(['tag.deleted', 'tag.unassigned', 'tag.assigned', 'tag.created']);
    expect(JSON.stringify(audit.body.data)).not.toContain('@a.de');
  });

  it('refuses a malformed request', async () => {
    const t = await h.call({ method: 'POST', path: '/v1/tags', key: A.key, body: { slug: 'Not A Slug', name: 'x' } });
    expect(t.status).toBe(400);
    const tag = await h.call({ method: 'POST', path: '/v1/tags', key: A.key, body: { slug: 'empty', name: 'Empty' } });
    const none = await h.call({ method: 'POST', path: `/v1/tags/${tag.body.id}/contacts`, key: A.key, body: { contact_ids: [] } });
    expect(none.status).toBe(400);
  });
});

describe('contact properties', () => {
  it('defines a type, enforces it on every upsert, and lets null remove a value', async () => {
    const def = await h.call({ method: 'POST', path: '/v1/contact-properties', key: A.key, body: { key: 'score', label: 'Score', type: 'number' } });
    expect(def.status).toBe(201);
    expect(def.body).toEqual({ key: 'score', label: 'Score', type: 'number' });
    const dup = await h.call({ method: 'POST', path: '/v1/contact-properties', key: A.key, body: { key: 'score', label: 'S', type: 'string' } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('already_exists');

    const bad = await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'typed@a.de', properties: { score: 'high' } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
    expect(bad.body.error.details.issues[0].path).toEqual(['properties', 'score']);
    expect((await h.call({ path: '/v1/contacts?email=typed@a.de', key: A.key })).body.data).toEqual([]);

    const ok = await contact(A.key, 'typed@a.de', { score: 7, free: { any: ['json'] } });
    expect(ok).toMatchObject({ tags: [] });
    const cleared = await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'typed@a.de', properties: { score: null } } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.contact.properties).toEqual({ free: { any: ['json'] } });

    for (const [type, good, wrong] of [
      ['boolean', true, 'yes'],
      ['date', '2026-09-18', '18.09.2026'],
      ['string', 'Berlin', 3],
    ] as const) {
      const key = `p_${type}`;
      expect((await h.call({ method: 'POST', path: '/v1/contact-properties', key: A.key, body: { key, label: key, type } })).status).toBe(201);
      const rejected = await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'typed@a.de', properties: { [key]: wrong } } });
      expect(rejected.status, type).toBe(400);
      const accepted = await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'typed@a.de', properties: { [key]: good } } });
      expect(accepted.status, type).toBe(200);
    }
  });

  it('refuses a definition existing data breaks, with examples, and frees the key again on delete', async () => {
    const holder = await contact(A.key, 'city@a.de', { city: 'Berlin' });
    const conflict = await h.call({ method: 'POST', path: '/v1/contact-properties', key: A.key, body: { key: 'city', label: 'City', type: 'number' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('conflict');
    expect(conflict.body.error.details).toMatchObject({ key: 'city', type: 'number', contact_ids: [holder.id] });

    expect((await h.call({ method: 'POST', path: '/v1/contact-properties', key: A.key, body: { key: 'city', label: 'City', type: 'string' } })).status).toBe(201);
    expect((await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'city@a.de', properties: { city: 1 } } })).status).toBe(400);

    const list = await h.call({ path: '/v1/contact-properties', key: A.key });
    expect(list.body.data.map((d: { key: string }) => d.key)).toContain('city');

    expect((await h.call({ method: 'DELETE', path: '/v1/contact-properties/city', key: A.key })).status).toBe(200);
    expect((await h.call({ method: 'DELETE', path: '/v1/contact-properties/city', key: A.key })).status).toBe(404);
    // Free-form again: any JSON is accepted and the stored values stayed.
    const free = await h.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { email: 'city@a.de', properties: { city: 1 } } });
    expect(free.status).toBe(200);
    const audit = await h.call({ path: '/v1/audit-log?action=contact_property.deleted', key: A.key });
    expect(audit.body.data[0].details).toMatchObject({ key: 'city', type: 'string' });
  });

  it('needs admin to define or delete', async () => {
    const keyRes = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'send', scope: 'send' } });
    const send = keyRes.body.key as string;
    const res = await h.call({ method: 'POST', path: '/v1/contact-properties', key: send, body: { key: 'x', label: 'X', type: 'string' } });
    expect(res.status).toBe(403);
    expect((await h.call({ path: '/v1/contact-properties', key: send })).status).toBe(200);
  });
});

describe('tenancy of tags, properties and segments', () => {
  it('A never reads or changes B', async () => {
    const bContact = await contact(B.key, 'only@b.de', { score: 'b-owned' });
    const bTag = await h.call({ method: 'POST', path: '/v1/tags', key: B.key, body: { slug: 'b-only', name: 'B' } });
    await h.call({ method: 'POST', path: `/v1/tags/${bTag.body.id}/contacts`, key: B.key, body: { contact_ids: [bContact.id] } });
    await h.call({ method: 'POST', path: '/v1/contact-properties', key: B.key, body: { key: 'b_prop', label: 'B', type: 'string' } });
    const bSeg = await h.call({
      method: 'POST',
      path: '/v1/segments',
      key: B.key,
      body: { name: 'B', filter: { field: 'tag', op: 'eq', value: 'b-only' } },
    });
    expect(bSeg.body.contact_count).toBe(1);

    // Reading
    expect((await h.call({ path: '/v1/tags', key: A.key })).body.data.map((t: { id: string }) => t.id)).not.toContain(bTag.body.id);
    expect((await h.call({ path: `/v1/tags?cursor=${bTag.body.id}`, key: A.key })).body.error.code).toBe('invalid_cursor');
    expect((await h.call({ path: '/v1/contact-properties', key: A.key })).body.data.map((d: { key: string }) => d.key)).not.toContain('b_prop');
    expect((await h.call({ path: `/v1/segments/${bSeg.body.id}`, key: A.key })).status).toBe(404);
    expect((await h.call({ path: '/v1/segments', key: A.key })).body.data.map((s: { id: string }) => s.id)).not.toContain(bSeg.body.id);
    // A's preview with B's slug sees nothing of B.
    const preview = await h.call({ method: 'POST', path: '/v1/segments/preview', key: A.key, body: { filter: { field: 'tag', op: 'eq', value: 'b-only' } } });
    expect(preview.body).toEqual({ contact_count: 0, sample: [] });

    // Changing
    const tagPath = `/v1/tags/${bTag.body.id}/contacts`;
    expect((await h.call({ method: 'POST', path: tagPath, key: A.key, body: { contact_ids: [bContact.id] } })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: tagPath, key: A.key, body: { contact_ids: [bContact.id] } })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: `/v1/tags/${bTag.body.id}`, key: A.key })).status).toBe(404);
    // A's own tag cannot reach B's contact.
    const aTag = await h.call({ method: 'POST', path: '/v1/tags', key: A.key, body: { slug: 'a-tag', name: 'A' } });
    const cross = await h.call({ method: 'POST', path: `/v1/tags/${aTag.body.id}/contacts`, key: A.key, body: { contact_ids: [bContact.id] } });
    expect(cross.body.contact_count).toBe(0);
    expect((await h.call({ method: 'DELETE', path: '/v1/contact-properties/b_prop', key: A.key })).status).toBe(404);
    // B's contact holds a string in `score`; A's number definition of score is A's alone.
    expect((await h.call({ method: 'POST', path: '/v1/contacts', key: B.key, body: { email: 'only@b.de', properties: { score: 'still-fine' } } })).status).toBe(200);
    expect(
      (await h.call({ method: 'PUT', path: `/v1/segments/${bSeg.body.id}`, key: A.key, body: { name: 'x', filter: { field: 'tag', op: 'eq', value: 'x' } } })).status,
    ).toBe(404);
    expect((await h.call({ method: 'DELETE', path: `/v1/segments/${bSeg.body.id}`, key: A.key })).status).toBe(404);

    // addSegment: B's segment into A's mailing, and A's segment into B's mailing.
    const { seedSending, createMailing } = await import('../support/sending.js');
    const aSend = await seedSending(h, A.id, { topic: 'a-news' });
    const bSend = await seedSending(h, B.id, { topic: 'b-news' });
    const aMailing = await createMailing(h, A, { topic: 'a-news', provider_id: aSend.provider.id });
    const bMailing = await createMailing(h, B, { topic: 'b-news', provider_id: bSend.provider.id });
    const aSeg = await h.call({ method: 'POST', path: '/v1/segments', key: A.key, body: { name: 'A', filter: { field: 'email', op: 'contains', value: '@' } } });
    const intoA = await h.call({ method: 'POST', path: `/v1/mailings/${aMailing.id}/recipients/segment`, key: A.key, body: { segment_id: bSeg.body.id } });
    expect(intoA.status).toBe(404);
    const intoB = await h.call({ method: 'POST', path: `/v1/mailings/${bMailing.id}/recipients/segment`, key: A.key, body: { segment_id: aSeg.body.id } });
    expect(intoB.status).toBe(404);

    // B is exactly as it was.
    expect((await h.call({ path: `/v1/segments/${bSeg.body.id}`, key: B.key })).body.contact_count).toBe(1);
    expect((await h.call({ path: `/v1/contacts/${bContact.id}`, key: B.key })).body.tags).toEqual(['b-only']);
    expect((await h.call({ path: '/v1/contact-properties', key: B.key })).body.data.map((d: { key: string }) => d.key)).toEqual(['b_prop']);
  });

  it('refuses a revoked key on every route', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'soon revoked' } });
    const key = created.body.key as string;
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${created.body.api_key.id}`, key: A.key });
    const id = '00000000-0000-4000-8000-000000000000';
    const calls: [string, string, unknown?][] = [
      ['GET', '/v1/tags'],
      ['POST', '/v1/tags', { slug: 'x', name: 'x' }],
      ['DELETE', `/v1/tags/${id}`],
      ['POST', `/v1/tags/${id}/contacts`, { contact_ids: [id] }],
      ['DELETE', `/v1/tags/${id}/contacts`, { contact_ids: [id] }],
      ['GET', '/v1/contact-properties'],
      ['POST', '/v1/contact-properties', { key: 'x', label: 'x', type: 'string' }],
      ['DELETE', '/v1/contact-properties/x'],
      ['GET', '/v1/segments'],
      ['POST', '/v1/segments', { name: 'x', filter: { field: 'tag', op: 'eq', value: 'x' } }],
      ['POST', '/v1/segments/preview', { filter: { field: 'tag', op: 'eq', value: 'x' } }],
      ['GET', `/v1/segments/${id}`],
      ['PUT', `/v1/segments/${id}`, { name: 'x', filter: { field: 'tag', op: 'eq', value: 'x' } }],
      ['DELETE', `/v1/segments/${id}`],
      ['POST', `/v1/mailings/${id}/recipients/segment`, { segment_id: id }],
    ];
    for (const [method, path, body] of calls) {
      const res = await h.call({ method, path, key, body });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.error.code).toBe('api_key_revoked');
    }
  });
});
