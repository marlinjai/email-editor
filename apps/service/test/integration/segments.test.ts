import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repos } from '../../src/repo/index.js';
import { startHarness, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, seedSending } from '../support/sending.js';

/**
 * Segments: every operator of every field family against a fixed set of
 * contacts, nesting, the depth limit, the preview, the count on read, adding a
 * segment to a mailing, engagement with tracking off and on, and a battery of
 * hostile inputs that must stay values, never SQL.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
let providerId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('segments');
  const seeded = await seedSending(h, W.id, { topic: 'news' });
  const news = seeded.topic;
  providerId = seeded.provider.id;
  const r = repos(h.sql);
  const events = (await r.topics.create(W.id, { slug: 'events', name: 'Events', description: null, translations: {} }))!;
  const founders = (await r.tags.create(W.id, { slug: 'founders', name: 'Founders' }))!;
  const press = (await r.tags.create(W.id, { slug: 'press', name: 'Press' }))!;
  const seed = async (
    key: string,
    c: { email: string; first?: string; last?: string; locale?: string; props?: Record<string, unknown> },
    topics: string[],
    tags: string[],
  ) => {
    const row = (await r.contacts.insert(W.id, {
      email: c.email,
      firstName: c.first ?? null,
      lastName: c.last ?? null,
      locale: c.locale ?? null,
      properties: c.props ?? {},
    }))!;
    for (const t of topics) await r.contacts.subscribe(W.id, row.id, t);
    await r.tags.assign(W.id, tags, [row.id]);
    ids[key] = row.id;
  };
  await seed(
    'ada',
    {
      email: 'ada@example.com',
      first: 'Ada',
      last: 'Lovelace',
      locale: 'de',
      props: { city: 'Berlin', score: 36, vip: true, joined: '2024-01-10', age: 36 },
    },
    [news.id],
    [founders.id],
  );
  await seed(
    'bob',
    { email: 'bob@test.org', first: 'Bob', locale: 'de-AT', props: { city: 'Wien', score: 52, vip: false, joined: '2023-05-01', age: 52 } },
    [news.id, events.id],
    [],
  );
  await seed('cleo', { email: 'cleo@example.com', first: 'Cleo', locale: 'en', props: { city: '100%_off\\x', age: '36' } }, [], [
    founders.id,
    press.id,
  ]);
  await seed('dan', { email: 'dan@sample.net' }, [events.id], []);
  for (const def of [
    { key: 'score', label: 'Score', type: 'number' },
    { key: 'vip', label: 'VIP', type: 'boolean' },
    { key: 'joined', label: 'Joined', type: 'date' },
    { key: 'city', label: 'City', type: 'string' },
  ]) {
    const res = await h.call({ method: 'POST', path: '/v1/contact-properties', key: W.key, body: def });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }
});
afterAll(() => h?.drop());

async function preview(filter: unknown, key = W.key) {
  return h.call({ method: 'POST', path: '/v1/segments/preview', key, body: { filter } });
}

/** The names (email local parts) a filter matches, sorted. */
async function match(filter: unknown): Promise<string[]> {
  const res = await preview(filter);
  expect(res.status, `${JSON.stringify(filter)}: ${JSON.stringify(res.body)}`).toBe(200);
  const names = res.body.sample.map((s: { email: string }) => s.email.split('@')[0]).sort();
  expect(res.body.contact_count).toBe(names.length);
  return names;
}

describe('contact columns', () => {
  it('email', async () => {
    expect(await match({ field: 'email', op: 'eq', value: 'ADA@example.com' })).toEqual(['ada']);
    expect(await match({ field: 'email', op: 'neq', value: 'ada@example.com' })).toEqual(['bob', 'cleo', 'dan']);
    expect(await match({ field: 'email', op: 'contains', value: '@example' })).toEqual(['ada', 'cleo']);
    expect(await match({ field: 'email', op: 'not_contains', value: '@example' })).toEqual(['bob', 'dan']);
    expect(await match({ field: 'email', op: 'starts_with', value: 'b' })).toEqual(['bob']);
    expect(await match({ field: 'email', op: 'in', value: ['dan@sample.net', 'nobody@x.de'] })).toEqual(['dan']);
    expect(await match({ field: 'email', op: 'not_in', value: ['dan@sample.net'] })).toEqual(['ada', 'bob', 'cleo']);
  });

  it('names, with exists and a missing value', async () => {
    expect(await match({ field: 'first_name', op: 'eq', value: 'ada' })).toEqual(['ada']);
    expect(await match({ field: 'first_name', op: 'neq', value: 'ada' })).toEqual(['bob', 'cleo', 'dan']);
    expect(await match({ field: 'first_name', op: 'exists' })).toEqual(['ada', 'bob', 'cleo']);
    expect(await match({ field: 'first_name', op: 'not_exists' })).toEqual(['dan']);
    expect(await match({ field: 'last_name', op: 'contains', value: 'LOVE' })).toEqual(['ada']);
    expect(await match({ field: 'last_name', op: 'not_contains', value: 'love' })).toEqual(['bob', 'cleo', 'dan']);
    expect(await match({ field: 'first_name', op: 'in', value: ['Bob', 'Cleo'] })).toEqual(['bob', 'cleo']);
    expect(await match({ field: 'first_name', op: 'not_in', value: ['Bob'] })).toEqual(['ada', 'cleo', 'dan']);
  });

  it('locale', async () => {
    expect(await match({ field: 'locale', op: 'starts_with', value: 'de' })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'locale', op: 'eq', value: 'DE' })).toEqual(['ada']);
    expect(await match({ field: 'locale', op: 'not_exists' })).toEqual(['dan']);
  });

  it('created_at', async () => {
    const past = '2000-01-01T00:00:00Z';
    const future = '2999-01-01T00:00:00Z';
    expect(await match({ field: 'created_at', op: 'gt', value: past })).toEqual(['ada', 'bob', 'cleo', 'dan']);
    expect(await match({ field: 'created_at', op: 'lte', value: past })).toEqual([]);
    expect(await match({ field: 'created_at', op: 'lt', value: future })).toHaveLength(4);
    expect(await match({ field: 'created_at', op: 'gte', value: future })).toEqual([]);
  });
});

describe('tags and topics', () => {
  it('tag membership', async () => {
    expect(await match({ field: 'tag', op: 'eq', value: 'founders' })).toEqual(['ada', 'cleo']);
    expect(await match({ field: 'tag', op: 'neq', value: 'founders' })).toEqual(['bob', 'dan']);
    expect(await match({ field: 'tag', op: 'in', value: ['press', 'nope'] })).toEqual(['cleo']);
    expect(await match({ field: 'tag', op: 'not_in', value: ['press', 'founders'] })).toEqual(['bob', 'dan']);
  });

  it('topic subscription', async () => {
    expect(await match({ field: 'topic', op: 'eq', value: 'news' })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'topic', op: 'neq', value: 'news' })).toEqual(['cleo', 'dan']);
    expect(await match({ field: 'topic', op: 'in', value: ['events'] })).toEqual(['bob', 'dan']);
    expect(await match({ field: 'topic', op: 'not_in', value: ['events', 'news'] })).toEqual(['cleo']);
  });
});

describe('properties', () => {
  it('a defined number', async () => {
    expect(await match({ field: 'property:score', op: 'gt', value: 40 })).toEqual(['bob']);
    expect(await match({ field: 'property:score', op: 'gte', value: 36 })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'property:score', op: 'lt', value: 40 })).toEqual(['ada']);
    expect(await match({ field: 'property:score', op: 'lte', value: 52 })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'property:score', op: 'eq', value: 36 })).toEqual(['ada']);
    expect(await match({ field: 'property:score', op: 'neq', value: 36 })).toEqual(['bob', 'cleo', 'dan']);
    expect(await match({ field: 'property:score', op: 'in', value: [52, 1] })).toEqual(['bob']);
    expect(await match({ field: 'property:score', op: 'not_in', value: [52] })).toEqual(['ada', 'cleo', 'dan']);
    expect(await match({ field: 'property:score', op: 'exists' })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'property:score', op: 'not_exists' })).toEqual(['cleo', 'dan']);
  });

  it('a defined boolean and a defined date', async () => {
    expect(await match({ field: 'property:vip', op: 'eq', value: true })).toEqual(['ada']);
    expect(await match({ field: 'property:vip', op: 'neq', value: true })).toEqual(['bob', 'cleo', 'dan']);
    expect(await match({ field: 'property:joined', op: 'gt', value: '2023-12-31' })).toEqual(['ada']);
    expect(await match({ field: 'property:joined', op: 'lte', value: '2024-01-10T23:00:00Z' })).toEqual(['ada', 'bob']);
    expect(await match({ field: 'property:joined', op: 'in', value: ['2023-05-01'] })).toEqual(['bob']);
  });

  it('a defined string, with LIKE characters matched literally', async () => {
    expect(await match({ field: 'property:city', op: 'eq', value: 'Berlin' })).toEqual(['ada']);
    expect(await match({ field: 'property:city', op: 'contains', value: 'ER' })).toEqual(['ada']);
    expect(await match({ field: 'property:city', op: 'contains', value: '%_' })).toEqual(['cleo']);
    expect(await match({ field: 'property:city', op: 'contains', value: '_' })).toEqual(['cleo']);
    expect(await match({ field: 'property:city', op: 'contains', value: '\\' })).toEqual(['cleo']);
    expect(await match({ field: 'property:city', op: 'starts_with', value: '100%' })).toEqual(['cleo']);
    expect(await match({ field: 'property:city', op: 'not_contains', value: 'i' })).toEqual(['cleo', 'dan']);
    expect(await match({ field: 'property:city', op: 'in', value: ['Wien', 'Rom'] })).toEqual(['bob']);
  });

  it('an undefined key compares JSON values by type', async () => {
    expect(await match({ field: 'property:age', op: 'eq', value: 36 })).toEqual(['ada']);
    expect(await match({ field: 'property:age', op: 'eq', value: '36' })).toEqual(['cleo']);
    expect(await match({ field: 'property:age', op: 'in', value: [36, '36'] })).toEqual(['ada', 'cleo']);
    expect(await match({ field: 'property:age', op: 'gt', value: 40 })).toEqual(['bob']);
    expect(await match({ field: 'property:age', op: 'contains', value: '3' })).toEqual(['cleo']);
    expect(await match({ field: 'property:missing', op: 'exists' })).toEqual([]);
    expect(await match({ field: 'property:missing', op: 'neq', value: 1 })).toEqual(['ada', 'bob', 'cleo', 'dan']);
  });

  it('refuses operators and values that do not fit the field, with the path', async () => {
    const bad = [
      [{ field: 'property:score', op: 'contains', value: '3' }, 'op'],
      [{ field: 'property:score', op: 'eq', value: '36' }, 'value'],
      [{ field: 'property:vip', op: 'gt', value: true }, 'op'],
      [{ field: 'property:city', op: 'gt', value: 'a' }, 'op'],
      [{ field: 'property:joined', op: 'eq', value: 'yesterday' }, 'value'],
      [{ field: 'property:age', op: 'gt', value: '40' }, 'value'],
      [{ field: 'tag', op: 'contains', value: 'f' }, 'op'],
      [{ field: 'tag', op: 'eq', value: 'Not A Slug' }, 'value'],
      [{ field: 'created_at', op: 'eq', value: '2024-01-01T00:00:00Z' }, 'op'],
      [{ field: 'created_at', op: 'gt', value: 'last week' }, 'value'],
      [{ field: 'email', op: 'in', value: [] }, 'value'],
      [{ field: 'email', op: 'eq', value: 5 }, 'value'],
    ] as const;
    for (const [leaf, at] of bad) {
      const res = await preview({ and: [{ field: 'email', op: 'contains', value: '@' }, leaf] });
      expect(res.status, JSON.stringify(leaf)).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.details.issues[0].path).toEqual(['filter', 'and', 1, at]);
    }
  });
});

describe('nesting, depth and saved segments', () => {
  it('and, or, not', async () => {
    expect(
      await match({
        and: [
          { field: 'topic', op: 'eq', value: 'news' },
          { or: [{ field: 'tag', op: 'eq', value: 'founders' }, { not: { field: 'property:score', op: 'lt', value: 50 } }] },
        ],
      }),
    ).toEqual(['ada', 'bob']);
    // not over a missing value is a match: COALESCE keeps the logic two-valued.
    expect(await match({ not: { field: 'property:score', op: 'gt', value: 40 } })).toEqual(['ada', 'cleo', 'dan']);
  });

  it('refuses a filter nested deeper than five levels', async () => {
    let f: unknown = { field: 'tag', op: 'eq', value: 'founders' };
    for (let i = 0; i < 4; i++) f = { not: f };
    expect((await preview(f)).status).toBe(200);
    const res = await preview({ not: f });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('a saved segment counts on read and follows the data', async () => {
    const created = await h.call({
      method: 'POST',
      path: '/v1/segments',
      key: W.key,
      body: { name: 'Founders', filter: { field: 'tag', op: 'eq', value: 'founders' } },
    });
    expect(created.status).toBe(201);
    expect(created.body.contact_count).toBe(2);
    const r = repos(h.sql);
    const founders = (await r.tags.bySlugs(W.id, ['founders']))[0]!;
    await r.tags.assign(W.id, [founders.id], [ids.dan!]);
    const got = await h.call({ path: `/v1/segments/${created.body.id}`, key: W.key });
    expect(got.body.contact_count).toBe(3);
    await r.tags.unassign(W.id, founders.id, [ids.dan!]);
    const list = await h.call({ path: '/v1/segments', key: W.key });
    expect(list.body.data.find((s: { id: string }) => s.id === created.body.id).contact_count).toBe(2);
    const updated = await h.call({
      method: 'PUT',
      path: `/v1/segments/${created.body.id}`,
      key: W.key,
      body: { name: 'Press', filter: { field: 'tag', op: 'eq', value: 'press' } },
    });
    expect(updated.body).toMatchObject({ name: 'Press', contact_count: 1 });
    const audit = await h.call({ path: `/v1/audit-log?target_id=${created.body.id}`, key: W.key });
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual(['segment.updated', 'segment.created']);
    expect((await h.call({ method: 'DELETE', path: `/v1/segments/${created.body.id}`, key: W.key })).status).toBe(200);
    expect((await h.call({ path: `/v1/segments/${created.body.id}`, key: W.key })).status).toBe(404);
  });
});

describe('mailings.addSegment', () => {
  it('queues only matching contacts subscribed to the topic, idempotently, and only while editable', async () => {
    const seg = await h.call({
      method: 'POST',
      path: '/v1/segments',
      key: W.key,
      body: { name: 'Founders', filter: { field: 'tag', op: 'eq', value: 'founders' } },
    });
    const mailing = await createMailing(h, W, { topic: 'news', provider_id: providerId });
    const add = () =>
      h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/recipients/segment`, key: W.key, body: { segment_id: seg.body.id } });
    // Founders are ada and cleo; cleo is not subscribed to news.
    const first = await add();
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ added: 1, already_present: 0, rejected: [] });
    const again = await add();
    expect(again.body).toEqual({ added: 0, already_present: 1, rejected: [] });
    const rows = await repos(h.sql).recipients.list(W.id, mailing.id, { limit: 10 });
    expect(rows.map((r) => r.email)).toEqual(['ada@example.com']);
    expect(rows[0]!.contact_id).toBe(ids.ada);

    await addRecipients(h, W, mailing.id, [{ email: 'bob@test.org' }]);
    expect((await action(h, W, mailing.id, 'send')).status).toBe(202);
    const late = await add();
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('mailing_invalid_state');
  });

  it('answers not_found for an unknown segment or mailing', async () => {
    const mailing = await createMailing(h, W, { topic: 'news', provider_id: providerId });
    const res = await h.call({
      method: 'POST',
      path: `/v1/mailings/${mailing.id}/recipients/segment`,
      key: W.key,
      body: { segment_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status).toBe(404);
    const noMailing = await h.call({
      method: 'POST',
      path: '/v1/mailings/00000000-0000-4000-8000-000000000000/recipients/segment',
      key: W.key,
      body: { segment_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(noMailing.status).toBe(404);
  });
});

describe('engagement', () => {
  const opened = { field: 'engagement:opened', op: 'lte', value: 30 };

  it('is refused while tracking is off, naming it', async () => {
    const res = await preview(opened);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('tracking_disabled');
    const saved = await h.call({ method: 'POST', path: '/v1/segments', key: W.key, body: { name: 'Openers', filter: opened } });
    expect(saved.status).toBe(422);
  });

  it('counts human opens and clicks within the window once tracking is on', async () => {
    const V = await h.seedWorkspace('engaged');
    const { topic, provider } = await seedSending(h, V.id, { topic: 'news' });
    const r = repos(h.sql);
    const people: Record<string, string> = {};
    for (const name of ['opener', 'machine', 'mpp', 'old', 'clicker']) {
      const c = (await r.contacts.insert(V.id, { email: `${name}@v.de` }))!;
      await r.contacts.subscribe(V.id, c.id, topic.id);
      people[name] = c.id;
    }
    const mailing = await createMailing(h, V, { topic: 'news', provider_id: provider.id });
    await addRecipients(
      h,
      V,
      mailing.id,
      Object.keys(people).map((n) => ({ email: `${n}@v.de` })),
    );
    const recipients = await r.recipients.list(V.id, mailing.id, { limit: 10 });
    const rid = (name: string) => recipients.find((x) => x.email === `${name}@v.de`)!.id;
    const event = (name: string, kind: 'open' | 'click', over: { machine?: boolean; mpp?: boolean; daysAgo?: number } = {}) =>
      h.sql`INSERT INTO tracking_events (workspace_id, mailing_id, recipient_id, contact_id, kind, link_idx, is_machine, is_apple_mpp, created_at)
            VALUES (${V.id}, ${mailing.id}, ${rid(name)}, ${people[name]!}, ${kind}, ${kind === 'click' ? 0 : null},
                    ${over.machine ?? false}, ${over.mpp ?? false}, now() - make_interval(days => ${over.daysAgo ?? 0}))`;
    await event('opener', 'open');
    await event('machine', 'open', { machine: true });
    await event('mpp', 'open', { mpp: true });
    await event('old', 'open', { daysAgo: 60 });
    await event('clicker', 'click');

    const previewV = (filter: unknown) => preview(filter, V.key);
    // The row alone is not enough while the master switch is off.
    await h.sql`INSERT INTO workspace_tracking (workspace_id, opens, clicks) VALUES (${V.id}, true, false)`;
    expect((await previewV(opened)).body.error.code).toBe('tracking_disabled');
    const on = await h.call({ method: 'PATCH', path: '/v1/workspace', key: V.key, body: { settings: { tracking_enabled: true } } });
    expect(on.status).toBe(200);

    const names = async (filter: unknown) => {
      const res = await previewV(filter);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return res.body.sample.map((s: { email: string }) => s.email.split('@')[0]).sort();
    };
    expect(await names(opened)).toEqual(['opener']);
    expect(await names({ field: 'engagement:opened', op: 'lte', value: 90 })).toEqual(['old', 'opener']);
    expect(await names({ field: 'engagement:opened', op: 'gt', value: 30 })).toEqual(['clicker', 'machine', 'mpp', 'old']);
    const clicks = await previewV({ field: 'engagement:clicked', op: 'lte', value: 30 });
    expect(clicks.body.error.code).toBe('tracking_disabled');
    await h.sql`UPDATE workspace_tracking SET clicks = true WHERE workspace_id = ${V.id}`;
    expect(await names({ field: 'engagement:clicked', op: 'lte', value: 30 })).toEqual(['clicker']);
    expect((await previewV({ field: 'engagement:clicked', op: 'lte', value: 0 })).status).toBe(400);
    expect((await previewV({ field: 'engagement:clicked', op: 'eq', value: 3 })).status).toBe(400);
  });
});

describe('hostile input stays a value', () => {
  const hostile = [
    "'; DROP TABLE contacts; --",
    "' OR '1'='1",
    "x') OR 1=1 --",
    '%',
    '_',
    '\\',
    '\\%',
    '$1',
    '::jsonb',
    '"}\'{',
    '?|',
    "' || pg_sleep(5) || '",
    'Grüße, ß',
    '😀 ❤',
    'a'.repeat(254),
  ];

  async function tableCounts() {
    const [row] = await h.sql<{ contacts: number; tags: number; segments: number; topics: number }[]>`
      SELECT (SELECT count(*)::int FROM contacts) AS contacts, (SELECT count(*)::int FROM tags) AS tags,
             (SELECT count(*)::int FROM segments) AS segments, (SELECT count(*)::int FROM topics) AS topics`;
    return row!;
  }

  it('matches nothing, never errors, and leaves every table intact', async () => {
    const before = await tableCounts();
    for (const v of hostile) {
      for (const leaf of [
        { field: 'email', op: 'eq', value: v },
        { field: 'email', op: 'contains', value: v },
        { field: 'first_name', op: 'starts_with', value: v },
        { field: 'first_name', op: 'in', value: [v, v] },
        { field: 'property:city', op: 'eq', value: v },
        { field: 'property:city', op: 'contains', value: v },
        { field: 'property:age', op: 'eq', value: v },
        { field: 'property:age', op: 'not_contains', value: v },
        { field: 'property:age', op: 'in', value: [v, 1, true, null] },
      ]) {
        const res = await preview(leaf);
        expect(res.status, `${JSON.stringify(leaf)}: ${JSON.stringify(res.body)}`).toBe(200);
        // Only not_contains matches everyone (no age is a string containing the value), and cleo's
        // city holds LIKE characters on purpose: they match literally, and only her.
        const expected =
          leaf.op === 'not_contains' ? 4 : leaf.field === 'property:city' && leaf.op === 'contains' && '100%_off\\x'.includes(v) ? 1 : 0;
        expect(res.body.contact_count, JSON.stringify(leaf)).toBe(expected);
      }
    }
    expect(await tableCounts()).toEqual(before);
  });

  it('refuses hostile property keys and slugs by schema, and binds the keys that pass', async () => {
    for (const field of [
      "property:x') OR 1=1 --",
      'property:city; DROP TABLE contacts',
      "property:a'b",
      'property:',
      `property:${'k'.repeat(65)}`,
      'contacts.email',
      'email OR 1=1',
    ]) {
      const res = await preview({ field, op: 'eq', value: 'x' });
      expect(res.status, field).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
    for (const value of ["founders' OR '1'='1", 'founders;--', 'FOUNDERS']) {
      const res = await preview({ field: 'tag', op: 'eq', value });
      expect(res.status, value).toBe(400);
    }
    // Keys the regex allows are still bound, so JSON-path-like names are just names.
    for (const field of ['property:city.name', 'property:--', 'property:a-b_c.d', 'property:..']) {
      const res = await preview({ field, op: 'exists' });
      expect(res.status, field).toBe(200);
      expect(res.body.contact_count).toBe(0);
    }
  });

  it('keeps a saved hostile filter a value on every read', async () => {
    const before = await tableCounts();
    const saved = await h.call({
      method: 'POST',
      path: '/v1/segments',
      key: W.key,
      body: { name: "'; DROP TABLE segments; --", filter: { field: 'property:city', op: 'eq', value: "'); DELETE FROM contacts; --" } },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.contact_count).toBe(0);
    expect((await h.call({ path: `/v1/segments/${saved.body.id}`, key: W.key })).body.name).toBe("'; DROP TABLE segments; --");
    expect(await tableCounts()).toEqual({ ...before, segments: before.segments + 1 });
  });

  it('bounds in-lists at 500 values', async () => {
    const many = Array.from({ length: 499 }, (_, i) => `u${i}@x.de`);
    const ok = await preview({ field: 'email', op: 'in', value: [...many, 'ada@example.com'] });
    expect(ok.status).toBe(200);
    expect(ok.body.contact_count).toBe(1);
    const tooMany = await preview({ field: 'email', op: 'in', value: [...many, 'x@y.de', 'ada@example.com'] });
    expect(tooMany.status).toBe(400);
  });
});
