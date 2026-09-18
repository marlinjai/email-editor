import { LIST_UNSUBSCRIBE_POST_VALUE, UNSUBSCRIBE_PATH_PREFIX, WebhookEvent } from '@marlinjai/mail-contract';
import { JSDOM, type DomDocument, type DomElement } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '../../src/events.js';
import { repos } from '../../src/repo/index.js';
import { TEST_UNSUBSCRIBE_CONTACT_ID, unsubscribeRoutes } from '../../src/routes/unsubscribe.js';
import { createUnsubscribeSigner } from '../../src/unsubscribe.js';
import { startHarness, type Harness } from '../support/harness.js';

/**
 * The hosted unsubscribe page end to end, against a real Postgres: what GET and
 * POST write (and do not), the RFC 8058 one-click form, refused tokens, the
 * transaction that holds the suppression, its audit row and its event together,
 * and the four paths of the stateful-flow standard (forward, backtrack, resume,
 * re-entry).
 */

const KEY_V1 = Buffer.alloc(32, 1);
const KEY_V2 = Buffer.alloc(32, 2);
const signer = createUnsubscribeSigner(new Map([[1, KEY_V1]]));
const HOST = 'mail.lumitra.test';
const ISSUED_AT = 1_790_000_000;

let h: Harness;
let pool: ReturnType<typeof repos>;

beforeAll(async () => {
  h = await startHarness({ unsubscribeSigner: signer });
  pool = repos(h.sql);
});
afterAll(() => h?.drop());

type Page = { status: number; html: string; doc: DomDocument; headers: Headers };

async function get(token: string, headers: Record<string, string> = {}, query = ''): Promise<Page> {
  const res = await h.app.request(`${UNSUBSCRIBE_PATH_PREFIX}${token}${query}`, { headers: { host: HOST, ...headers } });
  const html = await res.text();
  return { status: res.status, html, doc: new JSDOM(html).window.document, headers: res.headers };
}

async function post(
  token: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
  app: { request: typeof h.app.request } = h.app,
): Promise<Page> {
  const res = await app.request(`${UNSUBSCRIBE_PATH_PREFIX}${token}`, {
    method: 'POST',
    headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
  const html = await res.text();
  return { status: res.status, html, doc: new JSDOM(html).window.document, headers: res.headers };
}

/** Submits a form found on a rendered page, the way a browser would. */
function submit(page: Page, form: DomElement, token: string) {
  const fields = Object.fromEntries(
    [...form.querySelectorAll('input')].map((i) => [i.name, i.value]),
  );
  expect(form.getAttribute('action')).toBe(`${UNSUBSCRIBE_PATH_PREFIX}${token}`);
  return post(token, fields);
}

let seq = 0;
/** A workspace with two topics, a contact subscribed to both, and an endpoint subscribed to both events. */
async function scenario(settings?: { default_locale: string; locales: string[] }) {
  const n = ++seq;
  const ws = await h.seedWorkspace(`unsub-${n}`);
  if (settings) await pool.workspaces.update(ws.id, { settings: { ...settings, tracking_enabled: false } });
  const news = (await pool.topics.create(ws.id, {
    slug: 'programme-updates',
    name: 'Programme updates',
    description: 'What is on next month.',
    translations: { de: { name: 'Programm-Neuigkeiten', description: null } },
  }))!;
  const venues = (await pool.topics.create(ws.id, { slug: 'venue-outreach', name: 'Venue outreach', description: null, translations: {} }))!;
  const contact = (await pool.contacts.insert(ws.id, { email: `Person${n}@Example.com`, externalId: `person-${n}`, locale: null }))!;
  await pool.contacts.setSubscriptions(ws.id, contact.id, [news.id, venues.id]);
  await pool.webhookEndpoints.create(ws.id, {
    url: 'https://client.example/hook',
    description: null,
    events: ['contact.unsubscribed', 'contact.resubscribed'],
    enabled: true,
    secretSealed: 'sealed:v1:test',
  });
  // A fixed issue time, so every call yields the same token: a page's form
  // action and the token a test posts to must match across a second boundary.
  const token = (topicId: string | null = news.id, contactId: string = contact.id) =>
    signer.sign({ workspace_id: ws.id, contact_id: contactId, mailing_id: null, topic_id: topicId, iat: ISSUED_AT });
  return { ws, news, venues, contact, token };
}

async function counts(workspaceId: string) {
  const [row] = await h.sql<{ s: number; a: number; e: number; d: number }[]>`
    SELECT
      (SELECT count(*)::int FROM suppressions WHERE workspace_id = ${workspaceId}) AS s,
      (SELECT count(*)::int FROM audit_log WHERE workspace_id = ${workspaceId}
         AND action IN ('contact.unsubscribed', 'suppression.deleted')) AS a,
      (SELECT count(*)::int FROM webhook_events WHERE workspace_id = ${workspaceId}) AS e,
      (SELECT count(*)::int FROM webhook_deliveries WHERE workspace_id = ${workspaceId}) AS d`;
  return row!;
}

async function events(workspaceId: string) {
  const rows = await h.sql<{ payload: unknown }[]>`
    SELECT payload FROM webhook_events WHERE workspace_id = ${workspaceId} ORDER BY created_at, id`;
  return rows.map((r) => WebhookEvent.parse(r.payload));
}

const stateOf = (page: Page, topicName: string) =>
  [...page.doc.querySelectorAll('section li')]
    .find((li) => li.querySelector('.topic-name')?.textContent === topicName)
    ?.querySelector('.state')?.textContent;

describe('GET /u/<token>', () => {
  it('shows the workspace, the masked address and every topic, and writes nothing', async () => {
    const s = await scenario();
    const before = await counts(s.ws.id);
    const page = await get(s.token());
    expect(page.status).toBe(200);
    expect(page.doc.querySelector('.lead')?.textContent).toBe(`Choose which emails you receive from Workspace unsub-${seq}.`);
    expect(page.doc.title).toBe(`Email preferences: Workspace unsub-${seq}`);
    expect(page.doc.querySelector('.address')?.textContent).toMatch(/p•••\d@e•••\.com/);
    expect(page.html).not.toContain('example.com');
    expect(stateOf(page, 'Programme updates')).toBe('Subscribed');
    expect(stateOf(page, 'Venue outreach')).toBe('Subscribed');
    expect(page.doc.querySelector('button.primary')?.textContent).toBe('Unsubscribe from Programme updates');
    // A link scanner opening it any number of times changes nothing.
    await get(s.token());
    await get(s.token(), { 'user-agent': 'SafeLinks scanner' });
    expect(await counts(s.ws.id)).toEqual(before);
  });

  it('sends the page with a strict policy, no caching and no indexing', async () => {
    const s = await scenario();
    const page = await get(s.token());
    const csp = page.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    expect(page.headers.get('content-type')).toMatch(/text\/html; charset=UTF-8/i);
  });

  it('picks the language from the switch, the browser, the contact and the workspace default, in that order', async () => {
    const s = await scenario({ default_locale: 'de', locales: ['de', 'en', 'fr', 'it', 'es'] });
    expect((await get(s.token())).doc.documentElement.lang).toBe('de');
    expect((await get(s.token(), { 'accept-language': 'fr-CH, en;q=0.5' })).doc.documentElement.lang).toBe('fr');
    expect((await get(s.token(), { 'accept-language': 'fr' }, '?lang=it')).doc.documentElement.lang).toBe('it');
    const german = await get(s.token());
    expect(german.doc.querySelector('button.primary')?.textContent).toBe('Programm-Neuigkeiten abbestellen');
    // The switch links to every offered language, the current one marked.
    const links = [...german.doc.querySelectorAll('nav a')].map((a) => a.getAttribute('hreflang'));
    expect(links).toEqual(['de', 'en', 'fr', 'it', 'es']);
    expect(german.doc.querySelector('nav a[aria-current]')?.getAttribute('hreflang')).toBe('de');
    // The contact's own locale beats the default when the browser offers nothing usable.
    await pool.contacts.update(s.ws.id, s.contact.id, { locale: 'es-ES' });
    expect((await get(s.token(), { 'accept-language': 'ja' })).doc.documentElement.lang).toBe('es');
  });

  it('offers only the languages the workspace has', async () => {
    const s = await scenario({ default_locale: 'en', locales: ['en'] });
    const page = await get(s.token(), { 'accept-language': 'de' }, '?lang=fr');
    expect(page.doc.documentElement.lang).toBe('en');
    expect(page.doc.querySelector('nav')).toBeNull();
  });
});

describe('refused tokens', () => {
  it('answers a tampered, truncated or foreign-key token with a friendly 400 that names nothing', async () => {
    const s = await scenario();
    const good = s.token();
    const [payload, sig] = good.split('.') as [string, string];
    const tampered = [
      `${payload}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`,
      `${payload}x.${sig}`,
      payload,
      'not-a-token',
      createUnsubscribeSigner(new Map([[1, Buffer.alloc(32, 9)]])).sign({
        workspace_id: s.ws.id,
        contact_id: s.contact.id,
        mailing_id: null,
        topic_id: s.news.id,
      }),
    ];
    for (const token of tampered) {
      const page = await get(token);
      expect(page.status, token).toBe(400);
      expect(page.doc.querySelector('h1')?.textContent).toBe('This link does not work');
      expect(page.html).not.toContain(s.ws.id);
      expect(page.html).not.toContain('Workspace unsub');
      expect((await post(token, { action: 'unsubscribe', scope: 'all' })).status).toBe(400);
      expect((await post(token, { 'List-Unsubscribe': 'One-Click' })).status).toBe(400);
    }
    expect((await counts(s.ws.id)).s).toBe(0);
  });

  it('never expires by age, but refuses a token under a retired key (the only way one "expires")', async () => {
    const s = await scenario();
    const ancient = signer.sign({ workspace_id: s.ws.id, contact_id: s.contact.id, mailing_id: null, topic_id: s.news.id, iat: 1 });
    expect((await get(ancient)).status).toBe(200);

    // After a rotation that drops v1, a v1 link is refused like any forged one.
    const rotated = await startHarness({ unsubscribeSigner: createUnsubscribeSigner(new Map([[2, KEY_V2]])) });
    try {
      const res = await rotated.app.request(`${UNSUBSCRIBE_PATH_PREFIX}${ancient}`, { headers: { host: HOST } });
      expect(res.status).toBe(400);
    } finally {
      await rotated.drop();
    }
  });

  it('refuses a token mixing two workspaces, and cannot touch the other workspace', async () => {
    const a = await scenario();
    const b = await scenario();
    // Workspace B's id with workspace A's topic: the topic is not B's.
    const mixed = signer.sign({ workspace_id: b.ws.id, contact_id: a.contact.id, mailing_id: null, topic_id: a.news.id });
    expect((await get(mixed)).status).toBe(400);
    expect((await post(mixed, { 'List-Unsubscribe': 'One-Click' })).status).toBe(400);
    // Workspace B with A's contact and no topic: that contact is not in B.
    const foreignContact = signer.sign({ workspace_id: b.ws.id, contact_id: a.contact.id, mailing_id: null, topic_id: null });
    expect((await post(foreignContact, { action: 'unsubscribe', scope: 'all' })).doc.querySelector('h1')?.textContent).toBe(
      'Nothing to change',
    );
    // A form naming A's topic through B's genuine token is refused.
    const bPage = await post(b.token(), { action: 'unsubscribe', scope: 'topic', topic: a.news.id });
    expect(bPage.status).toBe(400);
    expect((await counts(a.ws.id)).s).toBe(0);
    expect((await counts(b.ws.id)).s).toBe(0);
  });

  it('refuses a token whose workspace no longer exists', async () => {
    const token = signer.sign({
      workspace_id: '00000000-0000-4000-8000-000000000000',
      contact_id: '00000000-0000-4000-8000-000000000001',
      mailing_id: null,
      topic_id: null,
    });
    expect((await get(token)).status).toBe(400);
  });

  it('refuses a malformed form', async () => {
    const s = await scenario();
    for (const fields of <Record<string, string>[]>[{}, { action: 'delete', scope: 'all' }, { action: 'unsubscribe', scope: 'topic' }, { action: 'unsubscribe', scope: 'topic', topic: 'x' }]) {
      expect((await post(s.token(), fields)).status, JSON.stringify(fields)).toBe(400);
    }
    // One-click with anything else in the body is not one-click.
    expect((await post(s.token(), { 'List-Unsubscribe': 'One-Click', extra: '1' })).status).toBe(400);
    expect((await counts(s.ws.id)).s).toBe(0);
  });
});

describe('POST /u/<token>', () => {
  it('unsubscribes once: the suppression, its audit row and its event, then a repeat is a no-op that still succeeds', async () => {
    const s = await scenario();
    const mailingToken = signer.sign({
      workspace_id: s.ws.id,
      contact_id: s.contact.id,
      mailing_id: '99999999-9999-4999-8999-999999999999',
      topic_id: s.news.id,
    });
    const page = await post(mailingToken, { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    expect(page.status).toBe(200);
    expect(page.doc.querySelector('h1')?.textContent).toBe('You are unsubscribed');
    expect(page.doc.querySelector('[role=status]')?.textContent).toContain('You will no longer receive Programme updates emails');
    expect(await counts(s.ws.id)).toEqual({ s: 1, a: 1, e: 1, d: 1 });

    const [block] = await pool.suppressions.list(s.ws.id, { limit: 10 });
    expect(block).toMatchObject({ email: s.contact.email, reason: 'unsubscribed', topic_id: s.news.id });
    const [audit] = await pool.audit.list(s.ws.id, { limit: 5, action: 'contact.unsubscribed' });
    expect(audit).toMatchObject({
      actor: { type: 'system', reason: 'hosted unsubscribe page' },
      target_type: 'contact',
      target_id: s.contact.id,
      details: { topic: 'programme-updates', scope: 'topic', source: 'hosted_page', suppression_id: block!.id },
    });
    const [event] = await events(s.ws.id);
    expect(event).toMatchObject({
      type: 'contact.unsubscribed',
      data: {
        contact_id: s.contact.id,
        external_id: s.contact.external_id,
        email: s.contact.email,
        topic: 'programme-updates',
        mailing_id: '99999999-9999-4999-8999-999999999999',
        source: 'hosted_page',
      },
    });

    const again = await post(mailingToken, { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    expect(again.status).toBe(200);
    expect(again.doc.querySelector('h1')?.textContent).toBe('You are unsubscribed');
    expect(await counts(s.ws.id)).toEqual({ s: 1, a: 1, e: 1, d: 1 });
    // The contact's subscriptions are the client's, and stay as they were.
    expect((await pool.contacts.get(s.ws.id, s.contact.id))!.topics).toEqual(['programme-updates', 'venue-outreach']);
  });

  it('applies two concurrent unsubscribes once', async () => {
    const s = await scenario();
    const results = await Promise.all([
      post(s.token(), { 'List-Unsubscribe': 'One-Click' }),
      post(s.token(), { 'List-Unsubscribe': 'One-Click' }),
      post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await counts(s.ws.id)).toEqual({ s: 1, a: 1, e: 1, d: 1 });
  });

  it('is the RFC 8058 one-click target: the token topic, 200, quickly, with no Origin', async () => {
    const s = await scenario();
    const started = Date.now();
    const res = await h.app.request(`${UNSUBSCRIBE_PATH_PREFIX}${s.token()}`, {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/x-www-form-urlencoded' },
      body: LIST_UNSUBSCRIBE_POST_VALUE,
    });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await res.text()).toBe('Unsubscribed.');
    const [event] = await events(s.ws.id);
    expect(event).toMatchObject({ type: 'contact.unsubscribed', data: { topic: 'programme-updates', source: 'one_click' } });
  });

  it('accepts the one-click body as multipart/form-data too, and blocks every topic for a token without one', async () => {
    const s = await scenario();
    const body = new FormData();
    body.set('List-Unsubscribe', 'One-Click');
    const res = await h.app.request(`${UNSUBSCRIBE_PATH_PREFIX}${s.token(null)}`, { method: 'POST', headers: { host: HOST }, body });
    expect(res.status).toBe(200);
    const blocks = await pool.suppressions.list(s.ws.id, { limit: 10 });
    expect(blocks.map((b) => b.topic_id)).toEqual([null]);
    expect((await events(s.ws.id))[0]).toMatchObject({ data: { topic: null, source: 'one_click' } });
  });

  it('rolls the suppression and the audit row back when the event cannot be written', async () => {
    const s = await scenario();
    const errors: unknown[] = [];
    const failing = unsubscribeRoutes(h.sql, {
      signer,
      emit: async (...args: Parameters<typeof emitEvent>) => {
        await emitEvent(...args);
        throw new Error('outbox unavailable');
      },
      log: { error: (...a: unknown[]) => errors.push(a) },
    });
    const page = await post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id }, {}, failing);
    expect(page.status).toBe(500);
    expect(page.doc.querySelector('h1')?.textContent).toBe('Something went wrong');
    expect(page.html).not.toContain('outbox unavailable');
    expect(errors).toHaveLength(1);
    expect(await counts(s.ws.id)).toEqual({ s: 0, a: 0, e: 0, d: 0 });

    // The same for a resubscribe: the lifted block comes back with its audit row gone.
    await post(s.token(), { action: 'unsubscribe', scope: 'all' });
    const before = await counts(s.ws.id);
    expect((await post(s.token(), { action: 'resubscribe', scope: 'all' }, {}, failing)).status).toBe(500);
    expect(await counts(s.ws.id)).toEqual(before);
  });

  it('refuses a POST from another website, but not one with no Origin or the "null" origin', async () => {
    const s = await scenario();
    const fields = { action: 'unsubscribe', scope: 'topic', topic: s.news.id };
    const foreign = await post(s.token(), fields, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(foreign.doc.querySelector('h1')?.textContent).toBe('Request not accepted');
    expect((await counts(s.ws.id)).s).toBe(0);

    expect((await post(s.token(), fields, { origin: 'null' })).status).toBe(200);
    expect((await post(s.token(), fields, { origin: `https://${HOST}` })).status).toBe(200);
    // Behind the proxy the public host arrives as X-Forwarded-Host.
    expect(
      (await post(s.token(), fields, { origin: 'https://mail.lumitra.co', host: 'service:3000', 'x-forwarded-host': 'mail.lumitra.co' })).status,
    ).toBe(200);
    expect((await counts(s.ws.id)).s).toBe(1);
  });

  it('refuses a body larger than a form', async () => {
    const s = await scenario();
    const page = await post(s.token(), { action: 'unsubscribe', scope: 'all', pad: 'x'.repeat(20_000) });
    expect(page.status).toBe(413);
    expect((await counts(s.ws.id)).s).toBe(0);
  });
});

describe('the four paths', () => {
  it('forward: unsubscribe from the topic of the mail', async () => {
    const s = await scenario();
    const page = await get(s.token());
    const done = await submit(page, page.doc.querySelector('button.primary')!.closest('form')!, s.token());
    expect(done.doc.querySelector('h1')?.textContent).toBe('You are unsubscribed');
    expect(stateOf(done, 'Programme updates')).toBe('Unsubscribed');
    expect(stateOf(done, 'Venue outreach')).toBe('Subscribed');
    expect(await pool.suppressions.findBlocking(s.ws.id, s.contact.email, s.news.id)).not.toBeNull();
    expect(await pool.suppressions.findBlocking(s.ws.id, s.contact.email, s.venues.id)).toBeNull();
  });

  it('backtrack: resubscribe from the confirmation restores exactly the earlier state, and is recorded', async () => {
    const s = await scenario();
    const done = await post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    const back = await submit(done, done.doc.querySelector('[role=status] form')!, s.token());
    expect(back.doc.querySelector('h1')?.textContent).toBe('You are subscribed again');
    expect(stateOf(back, 'Programme updates')).toBe('Subscribed');
    expect(await pool.suppressions.list(s.ws.id, { limit: 10 })).toEqual([]);
    expect((await pool.contacts.get(s.ws.id, s.contact.id))!.topics).toEqual(['programme-updates', 'venue-outreach']);

    const [audit] = await pool.audit.list(s.ws.id, { limit: 1, action: 'suppression.deleted' });
    expect(audit).toMatchObject({ actor: { type: 'system' }, target_id: s.contact.id, details: { resubscribed: true, topic: 'programme-updates' } });
    const all = await events(s.ws.id);
    expect(all.map((e) => e.type)).toEqual(['contact.unsubscribed', 'contact.resubscribed']);
    expect(all[1]).toMatchObject({ data: { topic: 'programme-updates', source: 'hosted_page', contact_id: s.contact.id } });
    // Each event queued one delivery to the endpoint subscribed to both.
    expect((await counts(s.ws.id)).d).toBe(2);

    // And the way forward again from the resubscribe confirmation.
    const again = await submit(back, back.doc.querySelector('[role=status] form')!, s.token());
    expect(stateOf(again, 'Programme updates')).toBe('Unsubscribed');
  });

  it('resume: reopening the link later shows the stored state and offers the way back', async () => {
    const s = await scenario();
    await post(s.token(), { 'List-Unsubscribe': 'One-Click' });
    const later = await get(s.token());
    expect(later.doc.querySelector('h1')?.textContent).toBe('Email preferences');
    expect(stateOf(later, 'Programme updates')).toBe('Unsubscribed');
    // The one-step button is gone; the row offers "Resubscribe" instead.
    expect(later.doc.querySelector('button.primary')).toBeNull();
    const row = [...later.doc.querySelectorAll('section li')][0]!;
    expect(row.querySelector('button')?.textContent).toBe('Resubscribe to Programme updates');
    const back = await submit(later, row.querySelector('form')!, s.token());
    expect(stateOf(back, 'Programme updates')).toBe('Subscribed');
  });

  it('re-entry: unsubscribe again, then from all topics, then back into one', async () => {
    const s = await scenario();
    await post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    const again = await post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    expect(again.doc.querySelector('h1')?.textContent).toBe('You are unsubscribed');
    expect((await events(s.ws.id)).length).toBe(1);

    const all = await post(s.token(), { action: 'unsubscribe', scope: 'all' });
    expect(all.doc.querySelector('[role=status]')?.textContent).toContain('You will no longer receive any emails');
    expect(stateOf(all, 'Venue outreach')).toBe('Unsubscribed');
    expect((await events(s.ws.id)).map((e) => ('topic' in e.data ? e.data.topic : undefined))).toEqual(['programme-updates', null]);

    // Back into venue outreach alone: the block on everything becomes a block on
    // every other topic, so programme updates stay off.
    const one = await post(s.token(), { action: 'resubscribe', scope: 'topic', topic: s.venues.id });
    expect(stateOf(one, 'Venue outreach')).toBe('Subscribed');
    expect(stateOf(one, 'Programme updates')).toBe('Unsubscribed');
    const blocks = await pool.suppressions.list(s.ws.id, { limit: 10 });
    expect(blocks.map((b) => b.topic_id)).toEqual([s.news.id]);
    expect((await events(s.ws.id)).at(-1)).toMatchObject({ type: 'contact.resubscribed', data: { topic: 'venue-outreach' } });

    // Undoing "all" after one topic was unsubscribed on its own keeps that one.
    await post(s.token(), { action: 'unsubscribe', scope: 'all' });
    const undoAll = await post(s.token(), { action: 'resubscribe', scope: 'all' });
    expect(stateOf(undoAll, 'Venue outreach')).toBe('Subscribed');
    expect(stateOf(undoAll, 'Programme updates')).toBe('Unsubscribed');
  });
});

describe('what the page may not lift', () => {
  it('shows a bounce or a manual block as paused, and a resubscribe changes nothing', async () => {
    const s = await scenario();
    await pool.suppressions.create(s.ws.id, { email: s.contact.email, reason: 'bounced', topicId: null });
    const page = await get(s.token());
    expect(stateOf(page, 'Programme updates')).toBe('Paused by the sender');
    expect(page.doc.querySelectorAll('section li button')).toHaveLength(0);
    const before = await counts(s.ws.id);
    const all = await post(s.token(), { action: 'resubscribe', scope: 'all' });
    const one = await post(s.token(), { action: 'resubscribe', scope: 'topic', topic: s.news.id });
    expect(await counts(s.ws.id)).toEqual(before);
    // No false "subscribed again": the plain page shows the true state.
    for (const page of [all, one]) {
      expect(page.doc.querySelector('h1')?.textContent).toBe('Email preferences');
      expect(page.doc.querySelector('[role=status]')).toBeNull();
      expect(stateOf(page, 'Programme updates')).toBe('Paused by the sender');
    }
  });
});

describe('special tokens', () => {
  it('a test send previews the page and never writes, one-click included', async () => {
    const s = await scenario();
    const token = s.token(s.news.id, TEST_UNSUBSCRIBE_CONTACT_ID);
    const page = await get(token);
    expect(page.status).toBe(200);
    expect(page.doc.querySelector('.notice.note')?.textContent).toContain('This is a preview from a test email');
    expect(page.doc.querySelector('.address')).toBeNull();
    const done = await post(token, { action: 'unsubscribe', scope: 'all' });
    expect(done.status).toBe(200);
    expect(done.doc.querySelector('[role=status]')?.textContent).toBe('Preview only: nothing was changed.');
    expect((await post(token, { 'List-Unsubscribe': 'One-Click' })).status).toBe(200);
    expect(await counts(s.ws.id)).toEqual({ s: 0, a: 0, e: 0, d: 0 });
  });

  it('an erased contact: nothing to change, nothing written, one-click still 200', async () => {
    const s = await scenario();
    await post(s.token(), { action: 'unsubscribe', scope: 'topic', topic: s.news.id });
    await pool.contacts.delete(s.ws.id, s.contact.id);
    const before = await counts(s.ws.id);
    const page = await get(s.token());
    expect(page.status).toBe(200);
    expect(page.doc.querySelector('h1')?.textContent).toBe('Nothing to change');
    expect(page.html).not.toContain(s.contact.email);
    expect((await post(s.token(), { action: 'unsubscribe', scope: 'all' })).doc.querySelector('h1')?.textContent).toBe('Nothing to change');
    expect((await post(s.token(), { 'List-Unsubscribe': 'One-Click' })).status).toBe(200);
    // The suppression written before the erasure is kept.
    expect(await counts(s.ws.id)).toEqual(before);
    expect(before.s).toBe(1);
  });
});
