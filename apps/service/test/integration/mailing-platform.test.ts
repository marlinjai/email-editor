import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAbDecisionJob } from '../../src/platform/ab-job.js';
import { createScheduleJob } from '../../src/platform/schedule-job.js';
import { createTrackingTokens } from '../../src/platform/tracking.js';
import { repos } from '../../src/repo/index.js';
import { startHarness, UNSUBSCRIBE_KEYS, type Harness } from '../support/harness.js';
import { documentWith, newsletter, textBlock, withoutUnsubscribe } from '../support/mail-documents.js';
import {
  action,
  addRecipients,
  createMailing,
  eventsOf,
  mailingStatus,
  makeWorker,
  recipientsOf,
  seedContact,
  seedSending,
} from '../support/sending.js';

/**
 * S4 on mailings: scheduling (release on time, reschedule, unschedule, a
 * restart, a release that can no longer start), A/B tests (manual and by
 * metric, the held remainder), and open and click tracking (off by default and
 * provably inert; on, with bot and Apple Mail Privacy Protection filtering and
 * no open redirect). The worker and the platform jobs run against a real
 * Postgres; time is driven through the jobs' `now`.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeEach(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('platform');
});
afterEach(() => h?.drop());

const MIN = 60_000;
const quiet = { error: () => {}, log: () => {} };
const scheduleJob = () => createScheduleJob({ sql: h.sql, compile: (d) => h.compiler.compile(d), log: quiet });
const abJob = () => createAbDecisionJob({ sql: h.sql, log: quiet });
const tokens = createTrackingTokens(UNSUBSCRIBE_KEYS);
/** A public /t/ endpoint answers a GIF, a redirect or a plain 404, never JSON. */
async function hit(path: string, userAgent?: string, method = 'GET') {
  return h.app.request(path, { method, headers: userAgent ? { 'user-agent': userAgent } : {} });
}
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/** A newsletter with one plain link, one personalised link and the unsubscribe link. */
const linked = () =>
  documentWith([
    textBlock('<p>Hello {{first_name|there}}, read <a href="https://example.org/story?a=1&b=2">the story</a>.</p>'),
    textBlock('<p><a href="https://example.org/u/{{first_name}}">your page</a></p>', 'txt-3'),
    textBlock('<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>', 'txt-2'),
  ]);

async function setup(people = 3, document: unknown = newsletter()) {
  const s = await seedSending(h, W.id);
  const contacts = [];
  for (let i = 0; i < people; i++) {
    contacts.push(await seedContact(h, W.id, s.topic.id, { email: `p${i}@example.com`, first_name: `P${i}` }));
  }
  const mailing = await createMailing(h, W, { topic: s.topic.slug, provider_id: s.provider.id, document });
  const added = await addRecipients(h, W, mailing.id, contacts.map((c) => ({ contact_id: c.id })));
  expect(added.status).toBe(200);
  return { ...s, contacts, mailing };
}

const schedule = (id: string, at: Date) => action(h, W, id, 'schedule', { send_at: at.toISOString() });
const inMinutes = (m: number) => new Date(Date.now() + m * MIN);

async function setTracking(opens: boolean, clicks: boolean) {
  const res = await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: W.key, body: { opens, clicks } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

describe('scheduling', () => {
  it('releases a scheduled mailing at its time, not before, through the same start as send', async () => {
    const { mailing } = await setup();
    const at = inMinutes(2);
    const res = await schedule(mailing.id, at);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'scheduled', scheduled_at: expect.any(String) });
    expect(new Date(res.body.scheduled_at).getTime()).toBe(at.getTime());

    expect(await scheduleJob().tick(new Date())).toBe(false);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('scheduled');

    expect(await scheduleJob().tick(inMinutes(3))).toBe(true);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sending');
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    expect(h.transport.sent).toHaveLength(3);

    const scheduled = await eventsOf(h, W.id, 'mailing.scheduled');
    expect(scheduled.map((e) => e.payload.data.scheduled_at)).toEqual([res.body.scheduled_at]);
    const started = await eventsOf(h, W.id, 'mailing.started');
    expect(started.map((e) => e.payload.data)).toEqual([expect.objectContaining({ trigger: 'schedule', recipients: 3 })]);
    const audit = await h.sql`SELECT action, actor FROM audit_log WHERE workspace_id = ${W.id} AND target_id = ${mailing.id} ORDER BY created_at`;
    expect(audit.map((a) => a.action)).toEqual(['mailing.created', 'mailing.scheduled', 'mailing.sent']);
    expect(audit[2]!.actor).toEqual({ type: 'system', reason: 'scheduled send' });
  });

  it('reschedules and unschedules before the release, and a release ignores the old time', async () => {
    const { mailing } = await setup();
    expect((await schedule(mailing.id, inMinutes(5))).status).toBe(200);
    const moved = await schedule(mailing.id, inMinutes(60));
    expect(moved.status).toBe(200);
    expect(await scheduleJob().tick(inMinutes(10))).toBe(false);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('scheduled');

    const back = await action(h, W, mailing.id, 'unschedule');
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: 'draft', scheduled_at: null });
    expect(await scheduleJob().tick(inMinutes(120))).toBe(false);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('draft');
    const events = await eventsOf(h, W.id, 'mailing.scheduled');
    expect(events.map((e) => e.payload.data.scheduled_at === null)).toEqual([false, false, true]);

    // Unscheduling a draft is not a transition.
    const again = await action(h, W, mailing.id, 'unschedule');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('mailing_invalid_state');
  });

  it('survives a restart: a new process and a new job release what is due', async () => {
    const { mailing } = await setup();
    await schedule(mailing.id, inMinutes(2));
    h.restartApp();
    expect((await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key })).body.status).toBe('scheduled');
    // Due long ago while nothing ran: released on the first tick.
    expect(await scheduleJob().tick(inMinutes(600))).toBe(true);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sending');
    // A second job instance racing for the same mailing finds nothing.
    expect(await scheduleJob().tick(inMinutes(600))).toBe(false);
    expect((await eventsOf(h, W.id, 'mailing.started')).length).toBe(1);
  });

  it('refuses a time in the past or beyond a year, and the checks send makes', async () => {
    const { mailing, topic, provider } = await setup();
    for (const at of [new Date(Date.now() - MIN), inMinutes(400 * 24 * 60)]) {
      const res = await schedule(mailing.id, at);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
    const empty = await createMailing(h, W, { topic: topic.slug, provider_id: provider.id });
    expect((await schedule(empty.id, inMinutes(5))).body.error.code).toBe('mailing_not_ready');
    const noLink = await createMailing(h, W, { topic: topic.slug, provider_id: provider.id, document: withoutUnsubscribe() });
    expect((await schedule(noLink.id, inMinutes(5))).body.error.code).toBe('missing_unsubscribe_url');
    await action(h, W, mailing.id, 'send');
    const late = await schedule(mailing.id, inMinutes(5));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('mailing_invalid_state');
  });

  it('a mailing edited into one that cannot start goes back to draft at its time, with the reason', async () => {
    const { mailing } = await setup();
    await schedule(mailing.id, inMinutes(2));
    const edit = await h.call({ method: 'PATCH', path: `/v1/mailings/${mailing.id}`, key: W.key, body: { document: withoutUnsubscribe() } });
    expect(edit.status).toBe(200);
    expect(await scheduleJob().tick(inMinutes(3))).toBe(true);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('draft');
    const [failed] = await eventsOf(h, W.id, 'mailing.schedule_failed');
    expect(failed!.payload.data).toMatchObject({ mailing_id: mailing.id, code: 'missing_unsubscribe_url' });
    expect(h.transport.sent).toHaveLength(0);
    const [audit] = await h.sql`SELECT details FROM audit_log WHERE workspace_id = ${W.id} AND action = 'mailing.schedule_failed'`;
    expect(audit!.details).toMatchObject({ code: 'missing_unsubscribe_url' });
  });

  it('send and cancel still work on a scheduled mailing; the release then leaves it alone', async () => {
    const a = await setup();
    await schedule(a.mailing.id, inMinutes(2));
    expect((await action(h, W, a.mailing.id, 'send')).status).toBe(202);
    const b = await createMailing(h, W, { topic: a.topic.slug, provider_id: a.provider.id });
    await addRecipients(h, W, b.id, [{ contact_id: a.contacts[0]!.id }]);
    await schedule(b.id, inMinutes(2));
    expect((await action(h, W, b.id, 'cancel')).body.status).toBe('cancelled');
    expect(await scheduleJob().tick(inMinutes(3))).toBe(false);
    const started = await eventsOf(h, W.id, 'mailing.started');
    expect(started.map((e) => e.payload.data.trigger)).toEqual(['send']);
  });
});

describe('A/B tests', () => {
  const abConfig = (over: Record<string, unknown> = {}) => ({
    variants: [
      { key: 'a', subject: 'Subject A' },
      { key: 'b', subject: 'Subject B' },
    ],
    test_fraction: 0.4,
    winner_metric: 'manual',
    ...over,
  });
  const setAb = (id: string, body: unknown) => h.call({ method: 'PUT', path: `/v1/mailings/${id}/ab-test`, key: W.key, body });
  const pick = (id: string, variant: string) => action(h, W, id, 'ab-test/winner', { variant });

  it('with tracking off only a manual pick is allowed, and the API says so', async () => {
    const { mailing } = await setup(2);
    for (const metric of ['opens', 'clicks']) {
      const res = await setAb(mailing.id, abConfig({ winner_metric: metric, decide_after_minutes: 60 }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('tracking_disabled');
      expect(res.body.error.message).toMatch(/manual/);
    }
    const manual = await setAb(mailing.id, abConfig());
    expect(manual.status, JSON.stringify(manual.body)).toBe(200);
    expect(manual.body.ab_test).toMatchObject({ status: 'pending', winner_metric: 'manual', winner: null });
  });

  it('manual: the test group gets the variants, the rest waits, then gets the winner', async () => {
    const { mailing } = await setup(10);
    expect((await setAb(mailing.id, abConfig())).status).toBe(200);
    expect((await pick(mailing.id, 'a')).body.error.code).toBe('conflict'); // not started
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    // 40 percent of 10: 4 in the test group, 2 per variant; 6 held.
    const first = h.transport.sent.map((m) => m.subject).sort();
    expect(first).toEqual(['Subject A', 'Subject A', 'Subject B', 'Subject B']);
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sending');
    const rows = await recipientsOf(h, W.id, mailing.id);
    expect(rows.filter((r) => r.held)).toHaveLength(6);

    const analytics = await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: W.key });
    expect(analytics.body.variants).toEqual([
      { key: 'a', sent: 2, unique_opens: null, unique_clicks: null },
      { key: 'b', sent: 2, unique_opens: null, unique_clicks: null },
    ]);

    const picked = await pick(mailing.id, 'b');
    expect(picked.status, JSON.stringify(picked.body)).toBe(200);
    expect(picked.body.ab_test).toMatchObject({ status: 'decided', winner: 'b', decided_by: 'manual' });
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    expect(h.transport.sent.filter((m) => m.subject === 'Subject B')).toHaveLength(8);
    const [event] = await eventsOf(h, W.id, 'mailing.ab_winner_selected');
    expect(event!.payload.data).toMatchObject({ winner: 'b', decided_by: 'manual' });
    expect((await pick(mailing.id, 'a')).body.error.code).toBe('conflict'); // decided once
  });

  it('by opens: the variant with more human opens wins after the wait', async () => {
    await setTracking(true, false);
    const { mailing } = await setup(10);
    expect((await setAb(mailing.id, abConfig({ winner_metric: 'opens', decide_after_minutes: 30 }))).status).toBe(200);
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    // Everyone who got B opens it; of A's, only a scanner and Apple's proxy do.
    for (const m of h.transport.sent) {
      const pixel = /src="https:\/\/[^/"]+(\/t\/o\/[^"]+)"/.exec(m.html)![1]!;
      const ua = m.subject === 'Subject B' ? BROWSER : 'Mozilla/5.0';
      expect((await hit(pixel, ua)).status).toBe(200);
      if (m.subject === 'Subject A') await hit(pixel, 'Barracuda Sentinel (EE)');
    }
    expect(await abJob().tick(inMinutes(10))).toBe(false); // not yet
    expect(await abJob().tick(inMinutes(31))).toBe(true);
    const got = await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key });
    expect(got.body.ab_test).toMatchObject({ status: 'decided', winner: 'b', decided_by: 'metric' });
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
    const analytics = await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: W.key });
    expect(analytics.body).toMatchObject({ unique_opens: 2, apple_mpp_opens: 2, machine_events: 2 });
    expect(analytics.body.variants).toEqual([
      { key: 'a', sent: 2, unique_opens: 0, unique_clicks: null },
      { key: 'b', sent: 8, unique_opens: 2, unique_clicks: null },
    ]);
  });

  it('a metric test whose tracking was turned off waits for a person', async () => {
    await setTracking(false, true);
    const { mailing } = await setup(4);
    expect((await setAb(mailing.id, abConfig({ winner_metric: 'clicks', decide_after_minutes: 15 }))).status).toBe(200);
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    await setTracking(false, false);
    expect(await abJob().tick(inMinutes(16))).toBe(true);
    const got = await h.call({ path: `/v1/mailings/${mailing.id}`, key: W.key });
    expect(got.body.ab_test.status).toBe('awaiting_pick');
    expect((await pick(mailing.id, 'a')).status).toBe(200);
    await makeWorker(h).drain();
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });

  it('refuses unknown variants, invalid documents and changes once sending, and can be cleared', async () => {
    const { mailing } = await setup(2);
    const bad = await setAb(mailing.id, { ...abConfig(), variants: [{ key: 'a', document: { version: '1.0', sections: [{ id: 's', type: 'nope' }] } }, { key: 'b', subject: 'B' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.variant).toBe('a');
    expect((await setAb(mailing.id, abConfig({ variants: [{ key: 'a', document: newsletter('Variant A') }, { key: 'b', subject: 'B' }] }))).status).toBe(200);
    const cleared = await h.call({ method: 'DELETE', path: `/v1/mailings/${mailing.id}/ab-test`, key: W.key });
    expect(cleared.body.ab_test).toBeNull();
    expect((await setAb(mailing.id, abConfig())).status).toBe(200);
    await action(h, W, mailing.id, 'send');
    expect((await pick(mailing.id, 'z')).status).toBe(400);
    const late = await setAb(mailing.id, abConfig());
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('mailing_invalid_state');
  });

  it('a variant document replaces the content for its recipients', async () => {
    const { mailing } = await setup(4);
    const res = await setAb(mailing.id, abConfig({ test_fraction: 1, variants: [{ key: 'a', document: newsletter('Variant A news') }, { key: 'b', subject: 'Only the subject' }] }));
    expect(res.status).toBe(200);
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    const a = h.transport.sent.filter((m) => m.html.includes('Variant A news'));
    const b = h.transport.sent.filter((m) => m.subject === 'Only the subject');
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(b.every((m) => m.html.includes('Spring news'))).toBe(true);
    // Everyone was in the test group: nothing is held, so it finished without a pick.
    expect(await mailingStatus(h, W.id, mailing.id)).toBe('sent');
  });
});

describe('tracking off (the default, and the ŌPUNTIA setting)', () => {
  it('adds no pixel, rewrites no link, and the endpoints refuse and record nothing', async () => {
    const got = await h.call({ path: '/v1/workspace/tracking', key: W.key });
    expect(got.body).toEqual({ opens: false, clicks: false });
    const { mailing } = await setup(1, linked());
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    const [sent] = h.transport.sent;
    expect(sent!.html).not.toContain('/t/o/');
    expect(sent!.html).not.toContain('/t/c/');
    expect(sent!.html).toContain('href="https://example.org/story?a=1&b=2"');
    const row = (await repos(h.sql).mailings.get(W.id, mailing.id))!;
    expect(row.tracking).toEqual({ opens: false, clicks: false });

    // Even a correctly signed token for this mailing is refused: it never carried one.
    const [r] = await recipientsOf(h, W.id, mailing.id);
    const ids = { workspaceId: W.id, mailingId: mailing.id, recipientId: r!.id };
    expect((await hit(`/t/o/${tokens.open(ids)}`, BROWSER)).status).toBe(404);
    expect((await hit(`/t/c/${tokens.click({ ...ids, linkIdx: 0 })}`, BROWSER)).status).toBe(404);
    expect((await h.sql`SELECT count(*)::int AS n FROM tracking_events`)[0]!.n).toBe(0);
    const analytics = await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: W.key });
    expect(analytics.body).toMatchObject({ tracking: { opens: false, clicks: false }, unique_opens: null, unique_clicks: null, links: null });
  });
});

describe('tracking on', () => {
  async function sentTracked() {
    await setTracking(true, true);
    const workspace = await h.call({ path: '/v1/workspace', key: W.key });
    expect(workspace.body.settings.tracking_enabled).toBe(true);
    const { mailing } = await setup(1, linked());
    await action(h, W, mailing.id, 'send');
    await makeWorker(h).drain();
    const html = h.transport.sent[0]!.html;
    const pixel = /src="https:\/\/[^/"]+(\/t\/o\/[^"]+)"/.exec(html)![1]!;
    const click = /href="https:\/\/[^/"]+(\/t\/c\/[^"]+)"/.exec(html)![1]!;
    // Delivered a minute ago, so a click is not mistaken for a scanner's.
    await h.sql`UPDATE messages SET created_at = now() - interval '1 minute' WHERE workspace_id = ${W.id}`;
    return { mailing, html, pixel, click };
  }

  it('adds the pixel, tracks only plain links, and leaves the unsubscribe and personalised links alone', async () => {
    const { html } = await sentTracked();
    expect(html).toMatch(/<img src="https:\/\/[^\/"]+\/t\/o\/[^"]+" width="1" height="1"/);
    expect(html).not.toContain('https://example.org/story');
    expect(html).toContain('href="https://example.org/u/P0"');
    expect(html).toMatch(/href="https:\/\/[^\/"]+\/u\/[^"]+"/);
  });

  it('records human opens and clicks, flags machines and Apple Mail Privacy Protection, and never redirects elsewhere', async () => {
    const { mailing, pixel, click } = await sentTracked();
    const open = await hit(pixel, BROWSER);
    expect(open.status).toBe(200);
    expect(open.headers.get('content-type')).toBe('image/gif');
    expect(open.headers.get('cache-control')).toContain('no-store');
    await hit(pixel, 'Mozilla/5.0');
    await hit(pixel, 'Mozilla/5.0 (compatible; Proofpoint URL Defense)');

    const go = await hit(`${click}?url=https://evil.example`, BROWSER);
    expect(go.status).toBe(302);
    expect(go.headers.get('location')).toBe('https://example.org/story?a=1&b=2');
    const head = await hit(click, BROWSER, 'HEAD');
    expect(head.status).toBe(302);

    const events = await h.sql`SELECT kind, is_machine, is_apple_mpp FROM tracking_events ORDER BY created_at`;
    expect(events.map((e) => [e.kind, e.is_machine, e.is_apple_mpp])).toEqual([
      ['open', false, false],
      ['open', false, true],
      ['open', true, false],
      ['click', false, false],
    ]);
    const analytics = await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: W.key });
    expect(analytics.body).toMatchObject({
      unique_opens: 1,
      apple_mpp_opens: 0,
      machine_events: 1,
      unique_clicks: 1,
      links: [{ url: 'https://example.org/story?a=1&b=2', unique_clicks: 1 }],
      variants: null,
    });
  });

  it('a click right after delivery is a scanner, not a person', async () => {
    const { mailing, click } = await sentTracked();
    await h.sql`UPDATE messages SET created_at = now() WHERE workspace_id = ${W.id}`;
    await hit(click, BROWSER);
    const analytics = await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: W.key });
    expect(analytics.body).toMatchObject({ unique_clicks: 0, machine_events: 1 });
  });

  it('refuses tampered tokens and links the mailing never had', async () => {
    const { mailing, pixel, click } = await sentTracked();
    const tamper = (p: string) => p.slice(0, -2) + (p.endsWith('AA') ? 'BB' : 'AA');
    expect((await hit(tamper(pixel))).status).toBe(404);
    expect((await hit(tamper(click))).status).toBe(404);
    const [r] = await recipientsOf(h, W.id, mailing.id);
    const unknownLink = tokens.click({ workspaceId: W.id, mailingId: mailing.id, recipientId: r!.id, linkIdx: 99 });
    expect((await hit(`/t/c/${unknownLink}`)).status).toBe(404);
    // An open token is not a click token.
    expect((await hit(pixel.replace('/t/o/', '/t/c/'))).status).toBe(404);
    expect((await h.sql`SELECT count(*)::int AS n FROM tracking_events`)[0]!.n).toBe(0);
  });

  it('turned off after sending: opens are refused, links still lead on, nothing is recorded', async () => {
    const { pixel, click } = await sentTracked();
    await setTracking(false, false);
    expect((await hit(pixel, BROWSER)).status).toBe(404);
    const go = await hit(click, BROWSER);
    expect(go.status).toBe(302);
    expect(go.headers.get('location')).toBe('https://example.org/story?a=1&b=2');
    expect((await h.sql`SELECT count(*)::int AS n FROM tracking_events`)[0]!.n).toBe(0);
    // The master switch alone also stops it.
    await setTracking(true, true);
    await h.call({ method: 'PATCH', path: '/v1/workspace', subject: W.owner, workspace: W.id, body: { settings: { tracking_enabled: false } } });
    expect((await hit(pixel, BROWSER)).status).toBe(404);
  });
});

describe('tenancy', () => {
  it('another workspace cannot schedule, test, pick, read analytics of, or change tracking of this one', async () => {
    const { mailing } = await setup(2);
    const B = await h.seedWorkspace('other');
    const as = (method: string, path: string, body?: unknown) => h.call({ method, path, key: B.key, body });
    const calls = [
      as('POST', `/v1/mailings/${mailing.id}/schedule`, { send_at: inMinutes(5).toISOString() }),
      as('POST', `/v1/mailings/${mailing.id}/unschedule`, {}),
      as('PUT', `/v1/mailings/${mailing.id}/ab-test`, { variants: [{ key: 'a', subject: 'x' }, { key: 'b', subject: 'y' }], test_fraction: 0.5, winner_metric: 'manual' }),
      as('DELETE', `/v1/mailings/${mailing.id}/ab-test`),
      as('POST', `/v1/mailings/${mailing.id}/ab-test/winner`, { variant: 'a' }),
      as('GET', `/v1/mailings/${mailing.id}/analytics`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
    }
    expect((await as('PUT', '/v1/workspace/tracking', { opens: true, clicks: true })).status).toBe(200);
    expect((await h.call({ path: '/v1/workspace/tracking', key: W.key })).body).toEqual({ opens: false, clicks: false });
    expect((await repos(h.sql).mailings.get(W.id, mailing.id))!.ab_test).toBeNull();

    // A token names its workspace: B's key cannot use A's mailing through it, and a
    // token claiming B for A's mailing names no mailing of B.
    const [r] = await recipientsOf(h, W.id, mailing.id);
    const crossed = tokens.open({ workspaceId: B.id, mailingId: mailing.id, recipientId: r!.id });
    expect((await hit(`/t/o/${crossed}`)).status).toBe(404);
  });

  it('a revoked key is refused, and a read-scope key cannot change tracking', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'reader', scope: 'read' } });
    const reader = created.body.key as string;
    expect((await h.call({ path: '/v1/workspace/tracking', key: reader })).status).toBe(200);
    expect((await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: reader, body: { opens: true, clicks: false } })).status).toBe(403);
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${created.body.api_key.id}`, key: W.key });
    const revoked = await h.call({ path: '/v1/workspace/tracking', key: reader });
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('api_key_revoked');
  });
});
