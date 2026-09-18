import { JSDOM, type DomDocument } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPurposeSigner } from '../../src/platform/tokens.js';
import { repos } from '../../src/repo/index.js';
import { signupConfirmationJob } from '../../src/signup/mail-job.js';
import { MemoryTransport } from '../../src/transport/index.js';
import { PUBLIC_BASE_URL, startHarness, UNSUBSCRIBE_KEYS, type Harness } from '../support/harness.js';
import { documentWith, textBlock } from '../support/mail-documents.js';
import { eventsOf, seedSending } from '../support/sending.js';

/**
 * Hosted signup forms with double opt-in, against a real Postgres: the API,
 * the hosted pages, the confirmation-mail outbox, bot protection, suppressions,
 * tenancy, and the four paths of the stateful-flow standard (forward: confirm;
 * backtrack and revise: another address before confirming, and the same
 * address resubmitted; resume: the link and the outbox after a restart;
 * re-entry: confirm twice, after expiry, and a re-sign-up when subscribed).
 */

type W = Awaited<ReturnType<Harness['seedWorkspace']>>;

let h: Harness;
let W: W;
let providerId: string;
let ipCounter = 0;
const renderSigner = createPurposeSigner(UNSUBSCRIBE_KEYS, 'signup-render');
const silent = { error: () => {}, log: () => {} };

/** A fresh client address per call site, so the per-address limit never couples two tests. */
const nextIp = () => `203.0.113.${++ipCounter}`;

beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('signup');
  await h.call({ method: 'PATCH', path: '/v1/workspace', key: W.key, body: { settings: { locales: ['en', 'de', 'fr'] } } });
  const { provider } = await seedSending(h, W.id, { topic: 'news' });
  providerId = provider.id;
  const r = repos(h.sql);
  for (const slug of ['events', 'press']) await r.topics.create(W.id, { slug, name: slug, description: null, translations: {} });
  await r.tags.create(W.id, { slug: 'website', name: 'Website' });
});
afterAll(() => h?.drop());

function job(transport: MemoryTransport = h.transport, over: Partial<Parameters<typeof signupConfirmationJob>[0]> = {}) {
  return signupConfirmationJob({
    sql: h.sql,
    transportFor: () => transport,
    rootKeys: UNSUBSCRIBE_KEYS,
    publicBaseUrl: PUBLIC_BASE_URL,
    retryDelaysMs: [0, 0, 0],
    log: silent,
    ...over,
  });
}

async function drain(j = job()) {
  for (let i = 0; i < 50 && (await j.tick(new Date())); i++);
}

async function createForm(w: W, body: Record<string, unknown> = {}) {
  const res = await h.call({
    method: 'POST',
    path: '/v1/signup-forms',
    key: w.key,
    body: {
      name: 'Newsletter',
      title: 'Stay in touch',
      consent_text: 'I agree to receive the newsletter.',
      translations: { de: { title: 'Bleiben Sie informiert', consent_text: 'Ich willige ein.' } },
      topics: ['news'],
      tags: ['website'],
      fields: ['first_name'],
      provider_id: providerId,
      allowed_origins: ['https://studio.example'],
      ...body,
    },
  });
  if (res.status !== 201) throw new Error(`create form: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; version: number } & Record<string, any>;
}

/** A form token issued `ageMs` ago. */
const tokenFor = (formId: string, ageMs = 10_000) => renderSigner.sign(`${formId}.${Date.now() - ageMs}`);

type Page = { status: number; html: string; doc: DomDocument; headers: Headers };

async function page(path: string, init: { method?: string; form?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Page> {
  const headers: Record<string, string> = { 'x-forwarded-for': nextIp(), ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  }
  const res = await h.app.request(path, { method: init.method ?? 'GET', headers, body });
  const html = await res.text();
  return { status: res.status, html, doc: new JSDOM(html).window.document , headers: res.headers };
}

async function signUp(formId: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return page(`/f/${formId}`, { method: 'POST', form: { form_token: tokenFor(formId), ...fields }, headers });
}

/** The confirmation token of the last mail sent to `email`. */
function linkFor(email: string, transport = h.transport): string {
  const mail = [...transport.sent].reverse().find((m) => m.to[0] === email);
  if (!mail) throw new Error(`no confirmation mail to ${email}`);
  const m = /\/f\/confirm\/([A-Za-z0-9._-]+)/.exec(mail.html);
  return m![1]!;
}

const sentTo = (email: string, transport = h.transport) => transport.sent.filter((m) => m.to[0] === email).length;

async function confirm(token: string, headers: Record<string, string> = {}) {
  return page(`/f/confirm/${token}`, { method: 'POST', form: { lang: 'en' }, headers });
}

async function contactOf(email: string, w: W = W) {
  return repos(h.sql).contacts.byEmail(w.id, email);
}

async function consentsOf(email: string, w: W = W) {
  return h.sql<{ topic: string; source: string; signup_form_version: number; consent_text: string; locale: string; submitted_ip_hash: string | null; confirmed_ip_hash: string | null }[]>`
    SELECT t.slug AS topic, cc.source, cc.signup_form_version, cc.consent_text, cc.locale, cc.submitted_ip_hash, cc.confirmed_ip_hash
    FROM contact_consents cc JOIN contacts c ON c.id = cc.contact_id LEFT JOIN topics t ON t.id = cc.topic_id
    WHERE cc.workspace_id = ${w.id} AND c.email = ${email} ORDER BY t.slug`;
}

async function blocksOf(email: string, w: W = W) {
  return h.sql<{ reason: string; topic: string | null }[]>`
    SELECT s.reason, t.slug AS topic FROM suppressions s LEFT JOIN topics t ON t.id = s.topic_id
    WHERE s.workspace_id = ${w.id} AND s.email = ${email} ORDER BY t.slug NULLS FIRST`;
}

describe('signup forms API', () => {
  it('creates, reads, updates (bumping the version) and soft-deletes a form, audited', async () => {
    const form = await createForm(W);
    expect(form).toMatchObject({ double_opt_in: true, version: 1, topics: ['news'], tags: ['website'], allowed_origins: ['https://studio.example'] });
    const updated = await h.call({ method: 'PUT', path: `/v1/signup-forms/${form.id}`, key: W.key, body: { ...form, fields: [], title: 'New' } });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 2, title: 'New', fields: [] });
    expect((await h.call({ path: '/v1/signup-forms', key: W.key })).body.data.map((f: any) => f.id)).toContain(form.id);
    expect((await h.call({ method: 'DELETE', path: `/v1/signup-forms/${form.id}`, key: W.key })).status).toBe(200);
    expect((await h.call({ path: `/v1/signup-forms/${form.id}`, key: W.key })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: `/v1/signup-forms/${form.id}`, key: W.key })).status).toBe(404);
    const audit = await h.call({ path: `/v1/audit-log?target_id=${form.id}`, key: W.key });
    expect(audit.body.data.map((e: any) => e.action).sort()).toEqual(['signup_form.created', 'signup_form.deleted', 'signup_form.updated']);
  });

  it('refuses unknown topics, tags, providers, bad origins and locales', async () => {
    const bad = async (body: Record<string, unknown>) =>
      h.call({
        method: 'POST',
        path: '/v1/signup-forms',
        key: W.key,
        body: { name: 'n', title: 't', consent_text: 'c', topics: ['news'], provider_id: providerId, ...body },
      });
    expect((await bad({ topics: ['nope'] })).body.error.code).toBe('unknown_topic');
    expect((await bad({ tags: ['nope'] })).body.error.code).toBe('validation_failed');
    expect((await bad({ provider_id: '00000000-0000-4000-8000-000000000000' })).body.error.code).toBe('unknown_provider');
    expect((await bad({ allowed_origins: ['https://x.example/path'] })).body.error.code).toBe('validation_failed');
    expect((await bad({ translations: { pt: { title: 't', consent_text: 'c' } } })).body.error.code).toBe('validation_failed');
    const ok = await bad({ allowed_origins: ['https://x.example/'] });
    expect(ok.status).toBe(201);
    expect(ok.body.allowed_origins).toEqual(['https://x.example']);
  });

  it('needs admin to create; a send-scoped key may read', async () => {
    const send = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'send', scope: 'send' } });
    const form = await createForm(W);
    const res = await h.call({ method: 'POST', path: '/v1/signup-forms', key: send.body.key, body: {} });
    expect(res.status).toBe(403);
    expect((await h.call({ path: `/v1/signup-forms/${form.id}`, key: send.body.key })).status).toBe(200);
  });

  it('compiles a confirmation template and requires {{confirm_url}} in it', async () => {
    const without = await h.call({
      method: 'POST',
      path: '/v1/templates',
      key: W.key,
      body: { name: 'No link', document: documentWith([textBlock('<p>Hello</p>')]) },
    });
    const refused = await h.call({
      method: 'POST',
      path: '/v1/signup-forms',
      key: W.key,
      body: { name: 'n', title: 't', consent_text: 'c', topics: ['news'], provider_id: providerId, confirmation_template_id: without.body.id },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/confirm_url/);

    const withLink = await h.call({
      method: 'POST',
      path: '/v1/templates',
      key: W.key,
      body: { name: 'Link', document: documentWith([textBlock('<p>Hi {{first_name|there}}, <a href="{{confirm_url}}">confirm here</a></p>')]) },
    });
    const form = await createForm(W, { confirmation_template_id: withLink.body.id });
    const r = await signUp(form.id, { email: 'template@example.com', first_name: 'Ada <b>' });
    expect(r.status).toBe(200);
    await drain();
    const mail = h.transport.sent.find((m) => m.to[0] === 'template@example.com')!;
    expect(mail.html).toContain('Hi Ada &lt;b&gt;');
    expect(mail.html).toMatch(new RegExp(`href="${PUBLIC_BASE_URL}/f/confirm/`));
  });

  it('returns the embed: hosted URL, a no-JS form with honeypot and empty token, script and token URLs', async () => {
    const form = await createForm(W);
    const res = await h.call({ path: `/v1/signup-forms/${form.id}/embed`, key: W.key });
    expect(res.body.hosted_url).toBe(`${PUBLIC_BASE_URL}/f/${form.id}`);
    expect(res.body.script_url).toBe(`${PUBLIC_BASE_URL}/f/${form.id}/embed.js`);
    expect(res.body.token_url).toBe(`${PUBLIC_BASE_URL}/f/${form.id}/token`);
    const doc = new JSDOM(res.body.html).window.document;
    const f = doc.querySelector('form')!;
    expect(f.getAttribute('action')).toBe(res.body.hosted_url);
    expect(f.getAttribute('method')).toBe('post');
    const website = f.querySelector('input[name=website]')!;
    expect(website.getAttribute('tabindex')).toBe('-1');
    expect(website.closest('[aria-hidden=true]')).not.toBeNull();
    expect(f.querySelector('input[name=form_token]')!.value).toBe('');
    expect(f.querySelector('input[name=first_name]')).not.toBeNull();
    expect(f.querySelector('input[name=last_name]')).toBeNull();

    const script = await h.app.request(`/f/${form.id}/embed.js`);
    expect(script.headers.get('content-type')).toMatch(/javascript/);
    expect(await script.text()).toContain(`${PUBLIC_BASE_URL}/f/${form.id}/token`);
  });
});

describe('the double opt-in, forward', () => {
  it('submit sends a mail through the provider; confirm subscribes, tags, records consent, audits and emits', async () => {
    const form = await createForm(W);
    const email = 'ada@example.com';
    const submitted = await signUp(form.id, { email: ' Ada@Example.com ', first_name: 'Ada', lang: 'de' }, { 'x-forwarded-for': '198.51.100.7' });
    expect(submitted.status).toBe(200);
    expect(submitted.doc.querySelector('h1')!.textContent).toBe('Sehen Sie in Ihr Postfach');
    // Nothing reaches contacts before confirmation.
    expect(await contactOf(email)).toBeNull();

    await drain();
    expect(sentTo(email)).toBe(1);
    const mail = h.transport.sent.find((m) => m.to[0] === email)!;
    expect(mail.subject).toBe('Bitte bestätigen Sie Ihre Anmeldung bei Workspace signup');
    expect(mail.headers['List-Unsubscribe']).toBeUndefined();
    const archived = await h.call({ path: '/v1/messages', key: W.key });
    expect(archived.body.data.some((m: any) => m.to === email && m.mailing_id === null && !m.is_test)).toBe(true);

    const token = linkFor(email);
    // GET writes nothing: a link scanner confirms nobody.
    const shown = await page(`/f/confirm/${token}`);
    expect(shown.status).toBe(200);
    expect(shown.doc.querySelector('form[method=post] button')).not.toBeNull();
    expect(await contactOf(email)).toBeNull();

    const done = await confirm(token, { 'x-forwarded-for': '198.51.100.8' });
    expect(done.status).toBe(200);
    expect(done.doc.querySelector('h1')!.textContent).toBe('You are subscribed');
    const contact = (await contactOf(email))!;
    expect(contact).toMatchObject({ first_name: 'Ada', locale: 'de', topics: ['news'], tags: ['website'] });
    const consents = await consentsOf(email);
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ topic: 'news', source: 'signup_form', signup_form_version: 1, consent_text: 'Ich willige ein.', locale: 'de' });
    expect(consents[0]!.submitted_ip_hash).toBeTruthy();
    expect(consents[0]!.submitted_ip_hash).not.toContain('198.51');
    expect(consents[0]!.confirmed_ip_hash).not.toBe(consents[0]!.submitted_ip_hash);

    const events = await eventsOf(h, W.id, 'contact.subscribed');
    const event = events.find((e) => e.payload.data.email === email)!;
    expect(event.payload.data).toMatchObject({ topics: ['news'], source: 'signup_form', signup_form_id: form.id, signup_form_version: 1 });
    const audit = await h.call({ path: `/v1/audit-log?action=contact.subscribed&target_id=${contact.id}`, key: W.key });
    expect(audit.body.data).toHaveLength(1);
  });

  it('redirects to the form redirect_url after confirming, and allows it in the page policy', async () => {
    const form = await createForm(W, { redirect_url: 'https://studio.example/thanks' });
    await signUp(form.id, { email: 'redirect@example.com' });
    await drain();
    const token = linkFor('redirect@example.com');
    const shown = await page(`/f/confirm/${token}`);
    expect(shown.headers.get('content-security-policy')).toContain("form-action 'self' https://studio.example");
    const res = await h.app.request(`/f/confirm/${token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'lang=en' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://studio.example/thanks');
  });
});

describe('backtrack and revise: changing the address before confirming', () => {
  it('only the confirmed address is subscribed; the other waits for its own link', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'typo@exmaple.com' });
    await signUp(form.id, { email: 'right@example.com' });
    await drain();
    await confirm(linkFor('right@example.com'));
    expect((await contactOf('right@example.com'))!.topics).toEqual(['news']);
    expect(await contactOf('typo@exmaple.com')).toBeNull();
    // The other link still works for whoever holds that inbox.
    await confirm(linkFor('typo@exmaple.com'));
    expect((await contactOf('typo@exmaple.com'))!.topics).toEqual(['news']);
  });

  it('the same address resubmitted supersedes the earlier link', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'twice@example.com', first_name: 'First' });
    await drain();
    const first = linkFor('twice@example.com');
    await signUp(form.id, { email: 'twice@example.com', first_name: 'Second' });
    await drain();
    const second = linkFor('twice@example.com');
    expect(second).not.toBe(first);

    const old = await confirm(first);
    expect(old.status).toBe(410);
    expect(old.doc.querySelector('h1')!.textContent).toBe('A newer link was sent');
    expect(await contactOf('twice@example.com')).toBeNull();
    await confirm(second);
    expect((await contactOf('twice@example.com'))!.first_name).toBe('Second');
  });

  it('a superseded submission whose mail had not gone out yet is never sent', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'quick@example.com' });
    await signUp(form.id, { email: 'quick@example.com' });
    await drain();
    expect(sentTo('quick@example.com')).toBe(1);
  });
});

describe('resume after a restart', () => {
  it('a confirmation link keeps working after the service restarts', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'restart@example.com' });
    await drain();
    const token = linkFor('restart@example.com');
    h.restartApp();
    await confirm(token);
    expect((await contactOf('restart@example.com'))!.topics).toEqual(['news']);
  });

  it('a mail queued before a crash is sent by the next process', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'queued@example.com' });
    h.restartApp();
    const transport = new MemoryTransport();
    await drain(job(transport));
    expect(sentTo('queued@example.com', transport)).toBe(1);
  });

  it('a mail left sending by a dead worker is sent again', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'stuck@example.com' });
    await h.sql`
      UPDATE signup_submissions SET mail_status = 'sending', mail_attempts = 1, mail_claimed_at = now() - interval '1 hour'
      WHERE email = 'stuck@example.com'`;
    const transport = new MemoryTransport();
    await drain(job(transport, { housekeepingEveryMs: 0 }));
    expect(sentTo('stuck@example.com', transport)).toBe(1);
  });

  it('retries a transient provider failure and fails a permanent one with the reason', async () => {
    const form = await createForm(W);
    const transport = new MemoryTransport();
    await signUp(form.id, { email: 'flaky@example.com' });
    transport.failNext('transient', 2);
    await drain(job(transport));
    expect(sentTo('flaky@example.com', transport)).toBe(1);

    await signUp(form.id, { email: 'refused@example.com' });
    transport.failNext('permanent');
    await drain(job(transport));
    const [row] = await h.sql<{ mail_status: string; mail_last_error: string }[]>`
      SELECT mail_status, mail_last_error FROM signup_submissions WHERE email = 'refused@example.com'`;
    expect(row).toMatchObject({ mail_status: 'failed' });
    expect(row!.mail_last_error).toBeTruthy();
  });
});

describe('re-entry after completion or failure', () => {
  it('confirming twice is a no-op', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'again@example.com' });
    await drain();
    const token = linkFor('again@example.com');
    await confirm(token);
    const before = (await eventsOf(h, W.id, 'contact.subscribed')).length;
    const second = await confirm(token);
    expect(second.status).toBe(200);
    expect(second.doc.querySelector('h1')!.textContent).toBe('Already confirmed');
    expect((await eventsOf(h, W.id, 'contact.subscribed')).length).toBe(before);
    expect(await consentsOf('again@example.com')).toHaveLength(1);
  });

  it('an expired link is refused, and signing up again works', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'late@example.com' });
    await drain();
    const token = linkFor('late@example.com');
    await h.sql`UPDATE signup_submissions SET expires_at = now() - interval '1 minute' WHERE email = 'late@example.com'`;
    const expired = await confirm(token);
    expect(expired.status).toBe(410);
    expect(expired.doc.querySelector(`a[href="/f/${form.id}"]`)).not.toBeNull();
    expect(await contactOf('late@example.com')).toBeNull();

    await signUp(form.id, { email: 'late@example.com' });
    await drain();
    await confirm(linkFor('late@example.com'));
    expect((await contactOf('late@example.com'))!.topics).toEqual(['news']);
  });

  it('an already subscribed address signing up again is a no-op: no mail', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'member@example.com' });
    await drain();
    await confirm(linkFor('member@example.com'));
    const res = await signUp(form.id, { email: 'member@example.com' });
    expect(res.doc.querySelector('h1')!.textContent).toBe('Check your inbox');
    await drain();
    expect(sentTo('member@example.com')).toBe(1);
  });

  it('a deleted form stops its pending confirmations', async () => {
    const form = await createForm(W);
    await signUp(form.id, { email: 'deleted@example.com' });
    await drain();
    const token = linkFor('deleted@example.com');
    await h.call({ method: 'DELETE', path: `/v1/signup-forms/${form.id}`, key: W.key });
    const res = await confirm(token);
    expect(res.status).toBe(410);
    expect(res.doc.querySelector('h1')!.textContent).toBe('This form is no longer available');
    expect(await contactOf('deleted@example.com')).toBeNull();
    expect((await page(`/f/${form.id}`)).status).toBe(404);
  });
});

describe('suppressions', () => {
  it('an all-topics unsubscribe re-opts in only through confirmation, narrowed to the form topics', async () => {
    const r = repos(h.sql);
    const email = 'optback@example.com';
    await r.suppressions.create(W.id, { email, reason: 'unsubscribed', topicId: null });
    const form = await createForm(W);
    await signUp(form.id, { email });
    await drain();
    expect(await blocksOf(email)).toEqual([{ reason: 'unsubscribed', topic: null }]);
    await confirm(linkFor(email));
    expect(await blocksOf(email)).toEqual([
      { reason: 'unsubscribed', topic: 'events' },
      { reason: 'unsubscribed', topic: 'press' },
    ]);
    expect((await contactOf(email))!.topics).toEqual(['news']);
    const resub = (await eventsOf(h, W.id, 'contact.resubscribed')).filter((e) => e.payload.data.email === email);
    expect(resub.map((e) => e.payload.data.topic)).toEqual(['news']);
    expect(await consentsOf(email)).toHaveLength(1);
  });

  it('never lifts a bounced block: a blocked address gets no mail', async () => {
    const r = repos(h.sql);
    await r.suppressions.create(W.id, { email: 'bounced@example.com', reason: 'bounced', topicId: null });
    const form = await createForm(W);
    const res = await signUp(form.id, { email: 'bounced@example.com' });
    expect(res.doc.querySelector('h1')!.textContent).toBe('Check your inbox');
    await drain();
    expect(sentTo('bounced@example.com')).toBe(0);
  });

  it('a manual block on one topic stays; the other topics are subscribed and the page says some are paused', async () => {
    const r = repos(h.sql);
    const news = (await r.topics.bySlug(W.id, 'news'))!;
    await r.suppressions.create(W.id, { email: 'manual@example.com', reason: 'manual', topicId: news.id });
    const form = await createForm(W, { topics: ['news', 'events'] });
    await signUp(form.id, { email: 'manual@example.com' });
    await drain();
    const done = await confirm(linkFor('manual@example.com'));
    expect(done.html).toContain('paused some emails');
    expect((await contactOf('manual@example.com'))!.topics).toEqual(['events']);
    expect(await blocksOf('manual@example.com')).toEqual([{ reason: 'manual', topic: 'news' }]);
  });
});

describe('bot protection', () => {
  it('a filled honeypot looks like success and does nothing', async () => {
    const form = await createForm(W);
    const res = await signUp(form.id, { email: 'bot@example.com', website: 'https://spam.example' });
    expect(res.doc.querySelector('h1')!.textContent).toBe('Check your inbox');
    const json = await h.call({ method: 'POST', path: `/v1/signup-forms/${form.id}/submit`, body: { email: 'bot2@example.com', website: 'x', form_token: tokenFor(form.id) } });
    expect(json.status).toBe(202);
    const n = await h.sql`SELECT 1 FROM signup_submissions WHERE email IN ('bot@example.com', 'bot2@example.com')`;
    expect(n).toHaveLength(0);
  });

  it('a post too soon, with a stale token, or without one gets the form back prefilled with a fresh token', async () => {
    const form = await createForm(W);
    for (const token of [tokenFor(form.id, 500), tokenFor(form.id, 25 * 60 * 60 * 1000), '', 'forged.token']) {
      const res = await page(`/f/${form.id}`, { method: 'POST', form: { email: 'slow@example.com', first_name: 'Slow', form_token: token } });
      expect(res.status).toBe(200);
      expect(res.doc.querySelector('[role=status]')!.textContent).toMatch(/press Subscribe/);
      expect(res.doc.querySelector('input[name=email]')!.value).toBe('slow@example.com');
      expect(res.doc.querySelector('input[name=first_name]')!.value).toBe('Slow');
      expect(res.doc.querySelector('input[name=form_token]')!.value).not.toBe('');
    }
    expect(await h.sql`SELECT 1 FROM signup_submissions WHERE email = 'slow@example.com'`).toHaveLength(0);
    // A token of another form does not pass either.
    const other = await createForm(W);
    const res = await page(`/f/${form.id}`, { method: 'POST', form: { email: 'slow@example.com', form_token: tokenFor(other.id) } });
    expect(res.doc.querySelector('[role=status]')).not.toBeNull();
  });

  it('rejects an invalid address on the page with an error bound to the field', async () => {
    const form = await createForm(W);
    const res = await signUp(form.id, { email: 'not-an-address' });
    expect(res.status).toBe(400);
    const input = res.doc.querySelector('input[name=email]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(res.doc.querySelector(`#${input.getAttribute('aria-describedby')!}`)!.textContent).toMatch(/valid email/);
  });

  it('the token endpoint answers with CORS only for allowed origins and no caching', async () => {
    const form = await createForm(W);
    const ok = await h.app.request(`/f/${form.id}/token`, { headers: { origin: 'https://studio.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://studio.example');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const body = (await ok.json()) as { form_token: string; not_before: string; expires_at: string };
    expect(new Date(body.not_before).getTime()).toBeGreaterThan(Date.now());
    const other = await h.app.request(`/f/${form.id}/token`, { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('rate limits', () => {
  let rh: Harness;
  let rw: W;
  let formId: string;
  beforeAll(async () => {
    rh = await startHarness({ signup: { ipLimit: 2, workspaceLimit: 4 } });
    rw = await rh.seedWorkspace('signup-limits');
    const { provider } = await seedSending(rh, rw.id, { topic: 'news' });
    const res = await rh.call({
      method: 'POST',
      path: '/v1/signup-forms',
      key: rw.key,
      body: { name: 'n', title: 't', consent_text: 'c', topics: ['news'], provider_id: provider.id },
    });
    formId = res.body.id;
  });
  afterAll(() => rh?.drop());

  const post = (email: string, ip: string) =>
    rh.app.request(`/f/${formId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
      body: new URLSearchParams({ email, form_token: tokenFor(formId) }).toString(),
    });

  it('limits per address, holds across a restart, and limits per workspace', async () => {
    expect((await post('a1@example.com', '192.0.2.1')).status).toBe(200);
    expect((await post('a2@example.com', '192.0.2.1')).status).toBe(200);
    rh.restartApp();
    const limited = await post('a3@example.com', '192.0.2.1');
    expect(limited.status).toBe(429);
    expect(await limited.text()).toContain('Too many attempts');
    // Another address still gets through, until the workspace limit.
    expect((await post('b1@example.com', '192.0.2.2')).status).toBe(200);
    expect((await post('c1@example.com', '192.0.2.3')).status).toBe(429);
    const json = await rh.call({
      method: 'POST',
      path: `/v1/signup-forms/${formId}/submit`,
      body: { email: 'd1@example.com', form_token: tokenFor(formId) },
      headers: { 'x-forwarded-for': '192.0.2.4' },
    });
    expect(json.status).toBe(429);
    expect(json.body.error.code).toBe('rate_limited');
    const rows = await rh.sql`SELECT email FROM signup_submissions ORDER BY email`;
    expect(rows.map((r) => r.email)).toEqual(['a1@example.com', 'a2@example.com', 'b1@example.com']);
  });
});

describe('the JSON submission route', () => {
  it('needs no credential, answers 202 for unknown and deleted forms, and queues a real one', async () => {
    const form = await createForm(W);
    const res = await h.call({
      method: 'POST',
      path: `/v1/signup-forms/${form.id}/submit`,
      body: { email: 'json@example.com', form_token: tokenFor(form.id), locale: 'fr' },
      headers: { origin: 'https://studio.example', 'x-forwarded-for': nextIp() },
    });
    expect(res.status).toBe(202);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://studio.example');
    await drain();
    expect(h.transport.sent.find((m) => m.to[0] === 'json@example.com')!.subject).toMatch(/^Veuillez confirmer/);

    const unknown = await h.call({
      method: 'POST',
      path: '/v1/signup-forms/00000000-0000-4000-8000-000000000000/submit',
      body: { email: 'ghost@example.com', form_token: 'x' },
    });
    expect(unknown.status).toBe(202);
    await h.call({ method: 'DELETE', path: `/v1/signup-forms/${form.id}`, key: W.key });
    const deleted = await h.call({
      method: 'POST',
      path: `/v1/signup-forms/${form.id}/submit`,
      body: { email: 'ghost2@example.com', form_token: tokenFor(form.id) },
    });
    expect(deleted.status).toBe(202);
    expect(await h.sql`SELECT 1 FROM signup_submissions WHERE email LIKE 'ghost%'`).toHaveLength(0);
  });

  it('answers the CORS preflight only for allowed origins', async () => {
    const form = await createForm(W);
    const preflight = (origin: string) =>
      h.app.request(`/v1/signup-forms/${form.id}/submit`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
      });
    const ok = await preflight('https://studio.example');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://studio.example');
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST');
    const other = await preflight('https://evil.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a malformed body with the contract error', async () => {
    const form = await createForm(W);
    const res = await h.call({ method: 'POST', path: `/v1/signup-forms/${form.id}/submit`, body: { email: 'nope' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('tenancy', () => {
  it('another workspace cannot read, change, embed or delete a form; a revoked key is refused', async () => {
    const other = await h.seedWorkspace('signup-other');
    const form = await createForm(W);
    const base = `/v1/signup-forms/${form.id}`;
    expect((await h.call({ path: base, key: other.key })).status).toBe(404);
    expect((await h.call({ path: `${base}/embed`, key: other.key })).status).toBe(404);
    expect((await h.call({ method: 'PUT', path: base, key: other.key, body: { name: 'n', title: 't', consent_text: 'c', topics: ['news'], provider_id: providerId } })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: base, key: other.key })).status).toBe(404);
    expect((await h.call({ path: '/v1/signup-forms', key: other.key })).body.data).toEqual([]);
    // Another workspace's provider cannot be named either.
    const cross = await h.call({ method: 'POST', path: '/v1/signup-forms', key: other.key, body: { name: 'n', title: 't', consent_text: 'c', topics: ['news'], provider_id: providerId } });
    expect(['unknown_topic', 'unknown_provider']).toContain(cross.body.error.code);
    expect((await h.call({ path: base, key: W.key })).status).toBe(200);

    const key = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${key.body.api_key.id}`, key: W.key });
    const revoked = await h.call({ path: base, key: key.body.key });
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('api_key_revoked');
  });
});

describe('erasure', () => {
  it('erasing the contact deletes its consent records and every signup submission, pending links included', async () => {
    const form = await createForm(W);
    const email = 'erase@example.com';
    await signUp(form.id, { email });
    await drain();
    expect((await confirm(linkFor(email))).status).toBe(200);
    // A pending confirmation for another form's topic.
    const other = await createForm(W, { topics: ['events'] });
    await signUp(other.id, { email });
    await drain();
    const pending = linkFor(email);
    expect(await consentsOf(email)).toHaveLength(1);

    const contact = (await contactOf(email))!;
    const erased = await h.call({ method: 'DELETE', path: `/v1/contacts/${contact.id}`, key: W.key });
    expect(erased.status).toBe(200);
    const [audit] = await h.sql`SELECT details FROM audit_log WHERE workspace_id = ${W.id} AND action = 'contact.erased'`;
    expect(audit!.details).toMatchObject({ erased_signups: 2 });
    expect((await h.sql`SELECT count(*)::int AS n FROM signup_submissions WHERE email = ${email}`)[0]!.n).toBe(0);
    expect((await h.sql`SELECT count(*)::int AS n FROM contact_consents WHERE workspace_id = ${W.id} AND contact_id = ${contact.id}`)[0]!.n).toBe(0);

    // The pending link no longer subscribes anyone.
    const late = await confirm(pending);
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(await contactOf(email)).toBeNull();
  });
});
