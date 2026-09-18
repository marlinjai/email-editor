import { LIST_UNSUBSCRIBE_POST_VALUE } from '@marlinjai/mail-contract';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { startHarness, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, eventsOf, makeWorker, recipientsOf, seedContact, seedSending } from '../support/sending.js';

/**
 * The unsubscribe links in a mail the worker really sent lead to the hosted page
 * and act on the right person and topic: the `{{unsubscribe_url}}` in the HTML
 * (a person clicking through the page) and the `List-Unsubscribe` URL with
 * `List-Unsubscribe-Post` (a mail client's RFC 8058 one-click). The next mailing
 * then skips exactly who unsubscribed, from exactly that topic.
 */

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('e2e-unsub');
});
afterAll(() => h?.drop());

/** The path of an absolute unsubscribe URL, which the in-process app is asked for. */
const pathOf = (url: string) => new URL(url).pathname;

function parse(html: string) {
  return new JSDOM(html).window.document;
}

describe('worker-sent unsubscribe links', () => {
  it('the HTML link and the one-click header URL unsubscribe the right person from the right topic', async () => {
    const r = repos(h.sql);
    const { topic: news, provider } = await seedSending(h, W.id);
    const events = (await r.topics.create(W.id, { slug: 'events', name: 'Events', description: null, translations: {} }))!;
    const ada = await seedContact(h, W.id, news.id, { email: 'ada@example.com', first_name: 'Ada', external_id: 'ext-ada' });
    const bob = await seedContact(h, W.id, news.id, { email: 'bob@example.com', first_name: 'Bob', external_id: 'ext-bob' });
    for (const c of [ada, bob]) await r.contacts.subscribe(W.id, c.id, events.id);

    const first = await createMailing(h, W, { topic: 'news', provider_id: provider.id });
    await addRecipients(h, W, first.id, [{ contact_id: ada.id }, { contact_id: bob.id }]);
    expect((await action(h, W, first.id, 'send')).status).toBe(202);
    await makeWorker(h).drain();
    const mails = new Map(h.transport.sent.map((m) => [m.to[0], m]));
    expect(mails.size).toBe(2);

    // Ada's mail client uses the header: POST the exact URL with the RFC 8058 body.
    const adaMail = mails.get('ada@example.com')!;
    expect(adaMail.headers['List-Unsubscribe-Post']).toBe(LIST_UNSUBSCRIBE_POST_VALUE);
    const headerUrl = /<(https?:\/\/[^>]+\/u\/[^>]+)>/.exec(adaMail.headers['List-Unsubscribe']!)![1]!;
    const oneClick = await h.app.request(pathOf(headerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: LIST_UNSUBSCRIBE_POST_VALUE,
    });
    expect(oneClick.status).toBe(200);

    // Bob clicks the link in the HTML: the page shows the mail's topic, he confirms.
    const bobMail = mails.get('bob@example.com')!;
    const htmlUrl = /href="(https?:\/\/[^"]+\/u\/[^"]+)"/.exec(bobMail.html)![1]!;
    expect(htmlUrl).not.toBe(headerUrl);
    const page = await h.app.request(pathOf(htmlUrl));
    expect(page.status).toBe(200);
    const doc = parse(await page.text());
    const confirm = doc.querySelector('button.primary')!;
    expect(confirm.textContent).toBe('Unsubscribe from News');
    const form = confirm.closest('form')!;
    expect(form.getAttribute('action')).toBe(pathOf(htmlUrl));
    const fields = Object.fromEntries([...form.querySelectorAll('input')].map((i) => [i.name, i.value]));
    const done = await h.app.request(pathOf(htmlUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    expect(done.status).toBe(200);
    expect(parse(await done.text()).querySelector('h1')?.textContent).toBe('You are unsubscribed');

    // Each unsubscribe is a news-only block on that person's address, reported
    // with the mailing it came from.
    const blocks = await r.suppressions.list(W.id, { limit: 10 });
    expect(blocks.map((b) => [b.email, b.topic, b.reason]).sort()).toEqual([
      ['ada@example.com', 'news', 'unsubscribed'],
      ['bob@example.com', 'news', 'unsubscribed'],
    ]);
    const unsubscribed = await eventsOf(h, W.id, 'contact.unsubscribed');
    expect(unsubscribed.map((e) => [e.payload.data.external_id, e.payload.data.source]).sort()).toEqual([
      ['ext-ada', 'one_click'],
      ['ext-bob', 'hosted_page'],
    ]);
    for (const e of unsubscribed) expect(e.payload.data).toMatchObject({ topic: 'news', mailing_id: first.id });

    // The next news mailing skips both; an events mailing still reaches both.
    const sentBefore = h.transport.sent.length;
    const second = await createMailing(h, W, { topic: 'news', provider_id: provider.id });
    await addRecipients(h, W, second.id, [{ contact_id: ada.id }, { contact_id: bob.id }]);
    await action(h, W, second.id, 'send');
    const third = await createMailing(h, W, { topic: 'events', provider_id: provider.id });
    await addRecipients(h, W, third.id, [{ contact_id: ada.id }, { contact_id: bob.id }]);
    await action(h, W, third.id, 'send');
    await makeWorker(h).drain();

    expect((await recipientsOf(h, W.id, second.id)).map((x) => [x.status, x.skip_reason])).toEqual([
      ['skipped', 'suppressed'],
      ['skipped', 'suppressed'],
    ]);
    expect((await recipientsOf(h, W.id, third.id)).map((x) => x.status)).toEqual(['sent', 'sent']);
    expect(h.transport.sent.slice(sentBefore).map((m) => m.to[0]).sort()).toEqual(['ada@example.com', 'bob@example.com']);
  });
});
