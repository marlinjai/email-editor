import { routes } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { appOver } from '../support/app-call.js';
import { startHarness, type Harness } from '../support/harness.js';

/*
 * Topics, contacts and suppressions (team F1 of S2): the upsert conflict matrix,
 * erasure, the contact lifecycle on the four paths of the stateful-flow
 * standard, suppressions with and without a topic, and tenancy.
 */

let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;

beforeAll(async () => {
  h = await startHarness();
  A = await h.seedWorkspace('contacts-a');
  B = await h.seedWorkspace('contacts-b');
});
afterAll(() => h?.drop());

let n = 0;
const unique = (s: string) => `${s}-${++n}`;

async function topic(key: string, slug = unique('t')) {
  const res = await h.call({ method: 'POST', path: '/v1/topics', key, body: { slug, name: `Topic ${slug}` } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; slug: string };
}

async function upsert(body: Record<string, unknown>, key = A.key) {
  return h.call({ method: 'POST', path: '/v1/contacts', key, body });
}

async function suppress(body: Record<string, unknown>, opts: { key?: string; subject?: string; workspace?: string } = { key: A.key }) {
  return h.call({ method: 'POST', path: '/v1/suppressions', ...opts, body });
}

async function unsubscribedEvents(workspaceId: string) {
  const rows = await h.sql<{ payload: any }[]>`
    SELECT payload FROM webhook_events WHERE workspace_id = ${workspaceId} AND type = 'contact.unsubscribed' ORDER BY created_at`;
  return rows.map((r) => r.payload);
}

describe('topics', () => {
  it('creates, refuses a duplicate slug, updates and lists', async () => {
    const t = await topic(A.key, 'news');
    expect(routes['topics.create'].response.safeParse(t).success).toBe(true);
    const dup = await h.call({ method: 'POST', path: '/v1/topics', key: A.key, body: { slug: 'news', name: 'Again' } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('already_exists');
    // The same slug in another workspace is another topic.
    await topic(B.key, 'news');
    const upd = await h.call({
      method: 'PATCH',
      path: `/v1/topics/${t.id}`,
      key: A.key,
      body: { description: 'Monthly', translations: { de: { name: 'Neuigkeiten', description: null } } },
    });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ slug: 'news', description: 'Monthly', translations: { de: { name: 'Neuigkeiten' } } });
    const empty = await h.call({ method: 'PATCH', path: `/v1/topics/${t.id}`, key: A.key, body: {} });
    expect(empty.status).toBe(400);
    const list = await h.call({ path: '/v1/topics?limit=100', key: A.key });
    expect(list.body.data.map((x: any) => x.slug)).toContain('news');
  });

  it('a topic used by a mailing cannot be deleted (the schema refuses)', async () => {
    const t = await topic(A.key);
    const p = await repos(h.sql).providers.create(A.id, {
      kind: 'resend', name: 'P', config: {}, secretSealed: null, fromName: 'N', fromEmail: 'n@example.com', replyTo: null,
      policy: { daily_recipient_budget: 10, min_interval_ms: 0, max_recipients_per_message: 1 },
    });
    await repos(h.sql).mailings.create(A.id, {
      name: null, subject: 'S', preheader: null, templateId: null, document: {}, topicId: t.id, providerId: p.id,
      metadata: {}, createdBy: { type: 'api_key', api_key_id: A.keyId },
    });
    await expect(h.sql`DELETE FROM topics WHERE id = ${t.id}`).rejects.toMatchObject({ code: '23503' });
  });

  it("workspace B cannot change A's topic or see it", async () => {
    const t = await topic(A.key);
    const res = await h.call({ method: 'PATCH', path: `/v1/topics/${t.id}`, key: B.key, body: { name: 'stolen' } });
    expect(res.status).toBe(404);
    const list = await h.call({ path: '/v1/topics?limit=100', key: B.key });
    expect(list.body.data.map((x: any) => x.id)).not.toContain(t.id);
    const cursor = await h.call({ path: `/v1/topics?cursor=${t.id}`, key: B.key });
    expect(cursor.body.error.code).toBe('invalid_cursor');
  });
});

describe('contacts: the upsert conflict matrix', () => {
  it('creates by email, normalising it, then finds the same contact again', async () => {
    const first = await upsert({ email: '  Ada.Lovelace@Example.COM ', first_name: 'Ada' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(routes['contacts.upsert'].response.safeParse(first.body).success).toBe(true);
    expect(first.body.created).toBe(true);
    expect(first.body.contact.email).toBe('ada.lovelace@example.com');
    const again = await upsert({ email: 'ADA.LOVELACE@example.com', last_name: 'Lovelace' });
    expect(again.body.created).toBe(false);
    expect(again.body.contact).toMatchObject({ id: first.body.contact.id, first_name: 'Ada', last_name: 'Lovelace' });
  });

  it('refuses an invalid address', async () => {
    const res = await upsert({ email: 'not-an-address' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('refuses a new external_id without an email', async () => {
    const res = await upsert({ external_id: unique('ext') });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('attaches an external_id to the contact found by email when it has none', async () => {
    const email = `${unique('attach')}@example.com`;
    const c = await upsert({ email });
    const ext = unique('crm');
    const res = await upsert({ external_id: ext, email });
    expect(res.body).toMatchObject({ created: false, contact: { id: c.body.contact.id, external_id: ext } });
  });

  it('finds by external_id first and lets the email change', async () => {
    const ext = unique('crm');
    const c = await upsert({ external_id: ext, email: `${unique('old')}@example.com` });
    const newEmail = `${unique('new')}@example.com`;
    const res = await upsert({ external_id: ext, email: newEmail });
    expect(res.body).toMatchObject({ created: false, contact: { id: c.body.contact.id, email: newEmail } });
    const byExt = await upsert({ external_id: ext, first_name: 'Only the id' });
    expect(byExt.body.contact).toMatchObject({ id: c.body.contact.id, email: newEmail, first_name: 'Only the id' });
  });

  it('refuses when external_id and email name two different contacts, and changes neither', async () => {
    const one = await upsert({ external_id: unique('crm'), email: `${unique('one')}@example.com` });
    const two = await upsert({ email: `${unique('two')}@example.com` });
    const res = await upsert({ external_id: one.body.contact.external_id, email: two.body.contact.email, first_name: 'merged?' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
    expect(res.body.error.details).toEqual({ external_id_contact_id: one.body.contact.id, email_contact_id: two.body.contact.id });
    for (const c of [one, two]) {
      const got = await h.call({ path: `/v1/contacts/${c.body.contact.id}`, key: A.key });
      expect(got.body.first_name).toBeNull();
      expect(got.body.email).toBe(c.body.contact.email);
    }
  });

  it("refuses a new external_id for an email whose contact carries another one", async () => {
    const c = await upsert({ external_id: unique('crm'), email: `${unique('owned')}@example.com` });
    const res = await upsert({ external_id: unique('other'), email: c.body.contact.email });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ email_contact_id: c.body.contact.id });
  });

  it('merges properties key by key, a null removing a key', async () => {
    const email = `${unique('props')}@example.com`;
    const c = await upsert({ email, properties: { plan: 'pro', city: 'Berlin', gone: null } });
    expect(c.body.contact.properties).toEqual({ plan: 'pro', city: 'Berlin' });
    const res = await upsert({ email, properties: { city: null, seats: 3 } });
    expect(res.body.contact.properties).toEqual({ plan: 'pro', seats: 3 });
  });

  it('replaces topics, refuses unknown ones and never re-subscribes past an unsubscribe', async () => {
    const t1 = await topic(A.key);
    const t2 = await topic(A.key);
    const t3 = await topic(A.key);
    const email = `${unique('topics')}@example.com`;
    const c = await upsert({ email, topics: [t1.slug, t2.slug] });
    expect(c.body.contact.topics).toEqual([t1.slug, t2.slug].sort());
    const unknown = await upsert({ email, topics: ['no-such-topic'] });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error).toMatchObject({ code: 'unknown_topic', details: { topics: ['no-such-topic'] } });

    await suppress({ email, reason: 'unsubscribed', topic: t2.slug });
    const again = await upsert({ email, topics: [t1.slug, t2.slug, t3.slug] });
    expect(again.body.contact.topics).toEqual([t1.slug, t3.slug].sort());

    await suppress({ email, reason: 'unsubscribed', topic: null });
    const none = await upsert({ email, topics: [t1.slug, t3.slug] });
    expect(none.body.contact.topics).toEqual([]);
  });

  it('two concurrent upserts of one new address end as one contact', async () => {
    const email = `${unique('race')}@example.com`;
    const results = await Promise.all([upsert({ email, first_name: 'x' }), upsert({ email, first_name: 'y' })]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(new Set(results.map((r) => r.body.contact.id)).size).toBe(1);
    expect(results.filter((r) => r.body.created)).toHaveLength(1);
  });
});

describe('contacts: list, get and messages', () => {
  it('lists with filters and cursor pagination', async () => {
    const t = await topic(A.key);
    const ext = unique('crm');
    const tagged = await upsert({ email: `${unique('list')}@example.com`, external_id: ext, topics: [t.slug] });
    await upsert({ email: `${unique('list')}@example.com` });
    const byTopic = await h.call({ path: `/v1/contacts?topic=${t.slug}`, key: A.key });
    expect(byTopic.body.data.map((c: any) => c.id)).toEqual([tagged.body.contact.id]);
    const byEmail = await h.call({ path: `/v1/contacts?email=${encodeURIComponent(tagged.body.contact.email.toUpperCase())}`, key: A.key });
    expect(byEmail.body.data.map((c: any) => c.id)).toEqual([tagged.body.contact.id]);
    const byExt = await h.call({ path: `/v1/contacts?external_id=${ext}`, key: A.key });
    expect(byExt.body.data).toHaveLength(1);
    expect((await h.call({ path: '/v1/contacts?topic=missing-topic', key: A.key })).body.error.code).toBe('unknown_topic');

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await h.call({ path: `/v1/contacts?limit=2${cursor ? `&cursor=${cursor}` : ''}`, key: A.key });
      expect(page.status).toBe(200);
      seen.push(...page.body.data.map((c: any) => c.id));
      cursor = page.body.next_cursor;
    } while (cursor);
    const [{ count }] = await h.sql`SELECT count(*)::int AS count FROM contacts WHERE workspace_id = ${A.id}`;
    expect(new Set(seen).size).toBe(count);
    expect(seen).toHaveLength(count);
  });

  it('an unknown or malformed id is not_found', async () => {
    expect((await h.call({ path: '/v1/contacts/00000000-0000-4000-8000-000000000000', key: A.key })).status).toBe(404);
    expect((await h.call({ path: '/v1/contacts/nope', key: A.key })).status).toBe(404);
  });
});

/** A contact with one mailing sent to it: a recipient row and an archived message. */
async function contactWithHistory(email: string, marker: string) {
  const c = await upsert({ email });
  const t = await topic(A.key);
  const r = repos(h.sql);
  const p = await r.providers.create(A.id, {
    kind: 'resend', name: 'P', config: {}, secretSealed: null, fromName: 'N', fromEmail: 'n@example.com', replyTo: null,
    policy: { daily_recipient_budget: 10, min_interval_ms: 0, max_recipients_per_message: 1 },
  });
  const m = await r.mailings.create(A.id, {
    name: null, subject: 'S', preheader: null, templateId: null, document: {}, topicId: t.id, providerId: p.id,
    metadata: {}, createdBy: { type: 'api_key', api_key_id: A.keyId },
  });
  await r.recipients.addMany(A.id, m.id, [{ email, contactId: c.body.contact.id, merge: {} }]);
  const [recipient] = await r.recipients.list(A.id, m.id, { limit: 1 });
  const message = await r.messages.insert(A.id, {
    mailingId: m.id, recipientId: recipient!.id, contactId: c.body.contact.id, to: email, subject: 'S',
    html: `<p>${marker}</p>`, providerId: p.id, providerMessageId: 'pm-1', outcome: 'sent', error: null, isTest: false, recipientCount: 1,
  });
  return { contactId: c.body.contact.id as string, topic: t, messageId: message.id };
}

describe('contacts: erasure', () => {
  it('deletes the contact, its recipients and archived HTML, keeps suppressions, audits without the address', async () => {
    const email = `${unique('erase')}@example.com`;
    const marker = unique('private-html');
    const { contactId, topic: t, messageId } = await contactWithHistory(email, marker);
    await suppress({ email, reason: 'unsubscribed', topic: t.slug });
    await suppress({ email, reason: 'manual', topic: null });

    const msgs = await h.call({ path: `/v1/contacts/${contactId}/messages`, key: A.key });
    expect(msgs.status).toBe(200);
    expect(routes['contacts.messages'].response.safeParse(msgs.body).success).toBe(true);
    expect(msgs.body.data.map((m: any) => m.id)).toEqual([messageId]);

    const erased = await h.call({ method: 'DELETE', path: `/v1/contacts/${contactId}`, key: A.key });
    expect(erased.status).toBe(200);
    expect(erased.body).toEqual({ ok: true, erased_messages: 1, erased_recipients: 1, suppressions_kept: 2 });

    expect((await h.call({ path: `/v1/contacts/${contactId}`, key: A.key })).status).toBe(404);
    expect((await h.call({ path: `/v1/contacts/${contactId}/messages`, key: A.key })).status).toBe(404);
    const [{ html }] = await h.sql`SELECT count(*)::int AS html FROM messages WHERE html LIKE ${`%${marker}%`}`;
    expect(html).toBe(0);
    const [{ rcpt }] = await h.sql`SELECT count(*)::int AS rcpt FROM mailing_recipients WHERE email = ${email}`;
    expect(rcpt).toBe(0);
    const kept = await h.call({ path: `/v1/suppressions?email=${encodeURIComponent(email)}`, key: A.key });
    expect(kept.body.data).toHaveLength(2);
    const [audit] = await h.sql`SELECT details FROM audit_log WHERE action = 'contact.erased' AND target_id = ${contactId}`;
    expect(audit!.details).toEqual({ erased_messages: 1, erased_recipients: 1, suppressions_kept: 2 });
    expect(JSON.stringify(audit)).not.toContain(email);

    const twice = await h.call({ method: 'DELETE', path: `/v1/contacts/${contactId}`, key: A.key });
    expect(twice.status).toBe(404);
  });
});

describe('contacts: the lifecycle on four paths', () => {
  it('forward, revise, resume after a restart, and re-create after erasure (still suppressed)', async () => {
    const t = await topic(A.key);
    const ext = unique('crm-person');
    const firstEmail = `${unique('life')}@example.com`;

    // 1. Forward: the client creates the person, subscribed to a topic.
    const created = await upsert({ external_id: ext, email: firstEmail, first_name: 'Grace', topics: [t.slug] });
    expect(created.body).toMatchObject({ created: true, contact: { email: firstEmail, topics: [t.slug] } });
    const id = created.body.contact.id;

    // 2. Backtrack and revise: the person's email changes in the client's system.
    // Same person, new address; the old address is free for someone else.
    const secondEmail = `${unique('life-new')}@example.com`;
    const revised = await upsert({ external_id: ext, email: secondEmail });
    expect(revised.body).toMatchObject({ created: false, contact: { id, email: secondEmail, first_name: 'Grace', topics: [t.slug] } });
    const other = await upsert({ email: firstEmail });
    expect(other.body.created).toBe(true);
    expect(other.body.contact.id).not.toBe(id);

    // 3. Resume from persistence: a new process over the same database sees the
    // same contact and upserts onto it.
    const restarted = appOver(h.sql);
    const got = await restarted.call({ path: `/v1/contacts/${id}`, key: A.key });
    expect(got.body).toMatchObject({ id, external_id: ext, email: secondEmail, topics: [t.slug] });
    const resumed = await restarted.call({ method: 'POST', path: '/v1/contacts', key: A.key, body: { external_id: ext, last_name: 'Hopper' } });
    expect(resumed.body).toMatchObject({ created: false, contact: { id, last_name: 'Hopper' } });

    // 4. Re-entry after completion: the person unsubscribes from everything and is
    // erased; the client re-creates them. A new contact, and the block still holds.
    await suppress({ email: secondEmail, reason: 'unsubscribed', topic: null });
    expect((await h.call({ method: 'DELETE', path: `/v1/contacts/${id}`, key: A.key })).body.suppressions_kept).toBe(1);
    const again = await upsert({ external_id: ext, email: secondEmail, topics: [t.slug] });
    expect(again.body.created).toBe(true);
    expect(again.body.contact.id).not.toBe(id);
    expect(again.body.contact.topics).toEqual([]);
    const blocking = await repos(h.sql).suppressions.findBlocking(A.id, secondEmail, t.id);
    expect(blocking?.reason).toBe('unsubscribed');
  });
});

describe('suppressions', () => {
  it('adds a manual block idempotently, without an event', async () => {
    const email = `${unique('manual')}@example.com`;
    const before = (await unsubscribedEvents(A.id)).length;
    const first = await suppress({ email: email.toUpperCase(), reason: 'manual', note: 'asked by phone' });
    expect(first.status).toBe(201);
    expect(routes['suppressions.create'].response.safeParse(first.body).success).toBe(true);
    expect(first.body).toMatchObject({ email, reason: 'manual', topic: null, note: 'asked by phone' });
    const second = await suppress({ email, reason: 'manual' });
    expect(second.body.id).toBe(first.body.id);
    expect((await unsubscribedEvents(A.id)).length).toBe(before);
  });

  it('an API unsubscribe emits contact.unsubscribed once, in the same transaction, and unsubscribes the contact', async () => {
    const t = await topic(A.key);
    const other = await topic(A.key);
    const email = `${unique('unsub')}@example.com`;
    const ext = unique('crm');
    const c = await upsert({ email, external_id: ext, topics: [t.slug, other.slug] });
    const before = (await unsubscribedEvents(A.id)).length;
    const res = await suppress({ email, reason: 'unsubscribed', topic: t.slug });
    expect(res.status).toBe(201);
    await suppress({ email, reason: 'unsubscribed', topic: t.slug });
    const events = (await unsubscribedEvents(A.id)).slice(before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'contact.unsubscribed',
      workspace_id: A.id,
      data: { contact_id: c.body.contact.id, external_id: ext, email, topic: t.slug, mailing_id: null, source: 'api' },
    });
    const after = await h.call({ path: `/v1/contacts/${c.body.contact.id}`, key: A.key });
    expect(after.body.topics).toEqual([other.slug]);
  });

  it('marks a dashboard unsubscribe as such, and reports an address without a contact', async () => {
    const email = `${unique('nobody')}@example.com`;
    const res = await suppress({ email, reason: 'unsubscribed' }, { subject: A.owner, workspace: A.id });
    expect(res.status).toBe(201);
    const [event] = (await unsubscribedEvents(A.id)).slice(-1);
    expect(event.data).toMatchObject({ email, contact_id: null, external_id: null, topic: null, source: 'dashboard' });
  });

  it('a topic block and an all-topics block coexist, and lifting one leaves the other', async () => {
    const t = await topic(A.key);
    const u = await topic(A.key);
    const email = `${unique('both')}@example.com`;
    const onTopic = await suppress({ email, reason: 'manual', topic: t.slug });
    const everywhere = await suppress({ email, reason: 'manual' });
    expect(onTopic.body.id).not.toBe(everywhere.body.id);
    const r = repos(h.sql).suppressions;
    expect((await r.findBlocking(A.id, email, u.id))?.id).toBe(everywhere.body.id);

    const lifted = await h.call({ method: 'DELETE', path: `/v1/suppressions/${everywhere.body.id}`, key: A.key });
    expect(lifted.body).toEqual({ ok: true });
    expect((await r.findBlocking(A.id, email, t.id))?.id).toBe(onTopic.body.id);
    expect(await r.findBlocking(A.id, email, u.id)).toBeNull();

    const byTopic = await h.call({ path: `/v1/suppressions?topic=${t.slug}`, key: A.key });
    expect(byTopic.body.data.map((s: any) => s.id)).toEqual([onTopic.body.id]);
    const [audit] = await h.sql`SELECT details FROM audit_log WHERE action = 'suppression.deleted' AND target_id = ${everywhere.body.id}`;
    expect(audit!.details).toEqual({ reason: 'manual', topic: null });
  });

  it('refuses an unknown topic, a reason reserved to the service, and an unknown id', async () => {
    const email = `${unique('bad')}@example.com`;
    expect((await suppress({ email, reason: 'manual', topic: 'no-such-topic' })).body.error.code).toBe('unknown_topic');
    expect((await suppress({ email, reason: 'bounced' })).status).toBe(400);
    const missing = await h.call({ method: 'DELETE', path: '/v1/suppressions/00000000-0000-4000-8000-000000000000', key: A.key });
    expect(missing.status).toBe(404);
  });

  it('lists newest first with filters and a cursor', async () => {
    const email = `${unique('list')}@example.com`;
    const t = await topic(A.key);
    const s1 = await suppress({ email, reason: 'manual' });
    const s2 = await suppress({ email, reason: 'unsubscribed', topic: t.slug });
    const page1 = await h.call({ path: `/v1/suppressions?email=${email}&limit=1`, key: A.key });
    expect(page1.body.data.map((s: any) => s.id)).toEqual([s2.body.id]);
    const page2 = await h.call({ path: `/v1/suppressions?email=${email}&limit=1&cursor=${page1.body.next_cursor}`, key: A.key });
    expect(page2.body.data.map((s: any) => s.id)).toEqual([s1.body.id]);
    const byReason = await h.call({ path: `/v1/suppressions?email=${email}&reason=manual`, key: A.key });
    expect(byReason.body.data.map((s: any) => s.id)).toEqual([s1.body.id]);
  });

  it('deleting needs admin: a send-scoped key may add a block but not lift one', async () => {
    const send = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'sender', scope: 'send' } });
    const added = await suppress({ email: `${unique('scoped')}@example.com`, reason: 'manual' }, { key: send.body.key });
    expect(added.status).toBe(201);
    const lift = await h.call({ method: 'DELETE', path: `/v1/suppressions/${added.body.id}`, key: send.body.key });
    expect(lift.status).toBe(403);
  });
});

describe('contacts and suppressions: tenancy', () => {
  it("workspace B cannot read, erase or list A's contacts, messages or suppressions", async () => {
    const email = `${unique('tenant')}@example.com`;
    const { contactId, messageId } = await contactWithHistory(email, unique('tenant-html'));
    const s = await suppress({ email, reason: 'manual' });
    for (const [method, path] of [
      ['GET', `/v1/contacts/${contactId}`],
      ['GET', `/v1/contacts/${contactId}/messages`],
      ['DELETE', `/v1/contacts/${contactId}`],
      ['DELETE', `/v1/suppressions/${s.body.id}`],
    ] as const) {
      expect((await h.call({ method, path, key: B.key })).status, `${method} ${path}`).toBe(404);
    }
    expect((await h.call({ path: `/v1/contacts?email=${email}`, key: B.key })).body.data).toEqual([]);
    expect((await h.call({ path: `/v1/suppressions?email=${email}`, key: B.key })).body.data).toEqual([]);
    expect((await h.call({ path: `/v1/contacts?cursor=${contactId}`, key: B.key })).body.error.code).toBe('invalid_cursor');
    expect((await h.call({ path: `/v1/suppressions?cursor=${s.body.id}`, key: B.key })).body.error.code).toBe('invalid_cursor');
    // A's contact, its message and its block are untouched.
    expect((await h.call({ path: `/v1/contacts/${contactId}/messages`, key: A.key })).body.data.map((m: any) => m.id)).toEqual([messageId]);
    expect((await h.call({ path: `/v1/suppressions?email=${email}`, key: A.key })).body.data).toHaveLength(1);
  });

  it("the same address in B is B's own contact, never A's", async () => {
    const email = `${unique('shared')}@example.com`;
    const inA = await upsert({ email, first_name: 'A' });
    const inB = await upsert({ email, first_name: 'B' }, B.key);
    expect(inB.body.created).toBe(true);
    expect(inB.body.contact.id).not.toBe(inA.body.contact.id);
    expect((await h.call({ path: `/v1/contacts/${inA.body.contact.id}`, key: A.key })).body.first_name).toBe('A');
    // A block in A does not stop B's topics.
    const tB = await topic(B.key);
    await suppress({ email, reason: 'unsubscribed' });
    const subscribed = await upsert({ email, topics: [tB.slug] }, B.key);
    expect(subscribed.body.contact.topics).toEqual([tB.slug]);
  });

  it('a revoked key is refused on every F1 resource', async () => {
    const minted = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'gone' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${minted.body.api_key.id}`, key: A.key });
    for (const path of ['/v1/contacts', '/v1/topics', '/v1/suppressions', '/v1/providers']) {
      const res = await h.call({ path, key: minted.body.key });
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('api_key_revoked');
    }
  });
});
