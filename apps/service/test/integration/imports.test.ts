import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createImportJob, type ImportJobOptions } from '../../src/imports/job.js';
import { PlatformWorker } from '../../src/platform/worker.js';
import { repos } from '../../src/repo/index.js';
import { startHarness, type Harness } from '../support/harness.js';

/*
 * The CSV import (S4): upload, mapping with a dry run, batched commit. The four
 * paths of the stateful-flow standard, suppressions, consent records, the
 * failure and crash handling of the batches, validation and tenancy.
 */

let h: Harness;
type W = Awaited<ReturnType<Harness['seedWorkspace']>>;
let n = 0;
const uniq = (s: string) => `${s}-${++n}`;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h?.drop());

/** A workspace with topics news and events, a tag founders and a typed property age. */
async function workspace() {
  const W = await h.seedWorkspace(uniq('imp'));
  const r = repos(h.sql);
  const news = (await r.topics.create(W.id, { slug: 'news', name: 'News', description: null, translations: {} }))!;
  const events = (await r.topics.create(W.id, { slug: 'events', name: 'Events', description: null, translations: {} }))!;
  const founders = (await r.tags.create(W.id, { slug: 'founders', name: 'Founders' }))!;
  await r.contactProperties.create(W.id, { key: 'age', label: 'Age', type: 'number' });
  return { W, news, events, founders };
}

function upload(W: W, csv: string, name = 'people.csv', key = W.key) {
  const form = new FormData();
  form.set('file', new File([csv], name, { type: 'text/csv' }));
  return h.call({ method: 'POST', path: '/v1/imports', key, form });
}

const MAPPING = { Email: 'email', Name: 'first_name', Age: 'property:age', City: 'property:city' };

function map(W: W, id: string, over: Record<string, unknown> = {}, key = W.key) {
  return h.call({
    method: 'PUT',
    path: `/v1/imports/${id}/mapping`,
    key,
    body: { mapping: MAPPING, topics: ['news', 'events'], tags: ['founders'], consent_confirmed: true, ...over },
  });
}

const commit = (W: W, id: string, version: number, key = W.key) =>
  h.call({ method: 'POST', path: `/v1/imports/${id}/commit`, key, body: { mapping_version: version } });
const get = (W: W, id: string, key = W.key) => h.call({ path: `/v1/imports/${id}`, key });

/** Runs the import job until it has no work, like the platform worker would. */
async function drain(options: Partial<ImportJobOptions> = {}, now = new Date()) {
  const errors: unknown[] = [];
  const job = createImportJob({ sql: h.sql, batchSize: 2, log: { error: (...a: unknown[]) => errors.push(a) }, ...options });
  await new PlatformWorker({ jobs: [job], now: () => now, log: { error: () => {}, log: () => {} } }).drain();
  return errors;
}

async function contact(W: W, email: string) {
  return repos(h.sql).contacts.byEmail(W.id, email);
}

async function eventsOf(W: W, type: string) {
  return h.sql<{ payload: any }[]>`SELECT payload FROM webhook_events WHERE workspace_id = ${W.id} AND type = ${type} ORDER BY created_at`;
}

async function consents(W: W, contactId: string) {
  return h.sql<{ topic_id: string; source: string; import_id: string; stated_by: any }[]>`
    SELECT topic_id, source, import_id, stated_by FROM contact_consents WHERE workspace_id = ${W.id} AND contact_id = ${contactId}`;
}

const CSV = [
  'Email,Name,Age,City',
  'ada@example.com,Ada,36,London', // 1 created
  'grace@example.com,Grace Hopper,,Arlington', // 2 updated (existing, new name and city)
  'same@example.com,Same,40,', // 3 unchanged (already has everything)
  'blocked@example.com,Blocked,,', // 4 suppressed (every topic)
  'newsless@example.com,Newsless,,', // 5 created without news (blocked for it)
  'not-an-address,X,,', // 6 invalid_email
  'ADA@example.com,Ada Again,,', // 7 duplicate_in_file
  'young@example.com,Young,abc,', // 8 invalid_value
  'short@example.com,Short', // 9 wrong_column_count
  ',Nobody,,', // 10 missing_email
].join('\n');

async function seedExisting(ctx: Awaited<ReturnType<typeof workspace>>) {
  const r = repos(h.sql);
  const { W, news, events, founders } = ctx;
  const grace = (await r.contacts.insert(W.id, { email: 'grace@example.com', firstName: 'Grace' }))!;
  const same = (await r.contacts.insert(W.id, { email: 'same@example.com', firstName: 'Same', properties: { age: 40 } }))!;
  await r.contacts.subscribe(W.id, same.id, news.id);
  await r.contacts.subscribe(W.id, same.id, events.id);
  await r.tags.assign(W.id, [founders.id], [same.id]);
  await r.suppressions.create(W.id, { email: 'blocked@example.com', reason: 'complained', topicId: null });
  await r.suppressions.create(W.id, { email: 'newsless@example.com', reason: 'unsubscribed', topicId: news.id });
  return { grace, same };
}

const EXPECTED = {
  created: 2,
  updated: 1,
  unchanged: 1,
  suppressed: 1,
  skipped: 5,
  skipped_by_reason: { invalid_email: 1, duplicate_in_file: 1, invalid_value: 1, wrong_column_count: 1, missing_email: 1 },
  topics_withheld: 1,
};

describe('CSV import, forward', () => {
  it('uploads, maps, dry-runs without writing, commits exactly the dry run, and reports every row', async () => {
    const ctx = await workspace();
    const { W, news, events, founders } = ctx;
    const { grace, same } = await seedExisting(ctx);

    const up = await upload(W, CSV);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({
      status: 'uploaded',
      file_name: 'people.csv',
      total_rows: 10,
      columns: ['Email', 'Name', 'Age', 'City'],
      suggested_mapping: { Email: 'email', Name: 'property:Name', Age: 'property:Age', City: 'property:City' },
      mapping: null,
      mapping_version: 0,
      dry_run: null,
      result: null,
    });
    expect(up.body.sample).toHaveLength(5);
    const id = up.body.id as string;

    const mapped = await map(W, id);
    expect(mapped.status, JSON.stringify(mapped.body)).toBe(202);
    expect(mapped.body).toMatchObject({ status: 'validating', mapping_version: 1, topics: ['news', 'events'], tags: ['founders'] });

    await drain();
    const validated = await get(W, id);
    expect(validated.body).toMatchObject({ status: 'validated', dry_run: EXPECTED, processed_rows: 10, result: null });
    // The dry run wrote nothing.
    expect(await contact(W, 'ada@example.com')).toBeNull();
    expect((await contact(W, 'grace@example.com'))!.first_name).toBe('Grace');

    const planRows = await h.call({ path: `/v1/imports/${id}/rows?outcome=skipped`, key: W.key });
    expect(planRows.body.data.map((r: any) => [r.row, r.reason])).toEqual([
      [6, 'invalid_email'],
      [7, 'duplicate_in_file'],
      [8, 'invalid_value'],
      [9, 'wrong_column_count'],
      [10, 'missing_email'],
    ]);
    expect(planRows.body.data[2].message).toMatch(/"abc" in column "Age" is not a number/);

    const sameBefore = (await contact(W, 'same@example.com'))!.updated_at;
    const committed = await commit(W, id, 1);
    expect(committed.status, JSON.stringify(committed.body)).toBe(202);
    expect(committed.body.status).toBe('committing');
    await drain();
    const done = await get(W, id);
    expect(done.body).toMatchObject({ status: 'completed', result: EXPECTED, processed_rows: 10 });
    expect(done.body.finished_at).not.toBeNull();

    const ada = (await contact(W, 'ada@example.com'))!;
    expect(ada).toMatchObject({ first_name: 'Ada', properties: { age: 36, city: 'London' }, topics: ['events', 'news'], tags: ['founders'] });
    const graceNow = (await contact(W, 'grace@example.com'))!;
    expect(graceNow).toMatchObject({ first_name: 'Grace Hopper', properties: { city: 'Arlington' }, topics: ['events', 'news'] });
    expect(await contact(W, 'blocked@example.com')).toBeNull();
    expect((await contact(W, 'newsless@example.com'))!.topics).toEqual(['events']);
    expect((await contact(W, 'same@example.com'))!.updated_at).toBe(sameBefore);

    // Consent: one record per newly subscribed topic, naming who stated it.
    const adaConsents = await consents(W, ada.id);
    expect(adaConsents.map((c) => c.topic_id).sort()).toEqual([news.id, events.id].sort());
    expect(adaConsents[0]).toMatchObject({ source: 'import', import_id: id, stated_by: { type: 'api_key', api_key_id: W.keyId } });
    expect((await consents(W, grace.id)).length).toBe(2);
    expect(await consents(W, same.id)).toHaveLength(0);
    expect((await consents(W, (await contact(W, 'newsless@example.com'))!.id)).map((c) => c.topic_id)).toEqual([events.id]);

    const rows = await h.call({ path: `/v1/imports/${id}/rows?limit=3`, key: W.key });
    expect(rows.body.data).toEqual([
      { row: 1, email: 'ada@example.com', outcome: 'created', reason: null, message: null, contact_id: ada.id },
      { row: 2, email: 'grace@example.com', outcome: 'updated', reason: null, message: null, contact_id: grace.id },
      { row: 3, email: 'same@example.com', outcome: 'unchanged', reason: null, message: null, contact_id: same.id },
    ]);
    expect(rows.body.next_cursor).toBe('3');
    const next = await h.call({ path: `/v1/imports/${id}/rows?limit=3&cursor=3`, key: W.key });
    expect(next.body.data[0]).toMatchObject({ row: 4, outcome: 'suppressed' });

    const [event] = await eventsOf(W, 'import.finished');
    expect(event!.payload.data).toMatchObject({ import_id: id, status: 'completed', result: EXPECTED, error: null });
    const audit = await h.call({ path: `/v1/audit-log?target_id=${id}`, key: W.key });
    expect(audit.body.data.map((a: any) => a.action).sort()).toEqual(['import.committed', 'import.created', 'import.finished', 'import.mapped']);
    expect(founders.id).toBeTruthy();
  });

  it('update_existing false only fills what is missing', async () => {
    const { W } = await workspace();
    const r = repos(h.sql);
    await r.contacts.insert(W.id, { email: 'keep@example.com', firstName: 'Kept', properties: { city: 'Rome' } });
    const up = await upload(W, 'Email,Name,Age,City\nkeep@example.com,Replaced,51,Paris\n');
    await map(W, up.body.id, { update_existing: false, topics: [], tags: [] });
    await drain();
    await commit(W, up.body.id, 1);
    await drain();
    expect(await contact(W, 'keep@example.com')).toMatchObject({ first_name: 'Kept', properties: { city: 'Rome', age: 51 } });
    expect((await get(W, up.body.id)).body.result).toMatchObject({ updated: 1 });
  });

  it('never lifts a suppression, whatever the file says', async () => {
    const { W, news } = await workspace();
    const r = repos(h.sql);
    await r.suppressions.create(W.id, { email: 'gone@example.com', reason: 'unsubscribed', topicId: null });
    await r.suppressions.create(W.id, { email: 'partial@example.com', reason: 'manual', topicId: news.id });
    const up = await upload(W, 'Email\ngone@example.com\npartial@example.com\n');
    await map(W, up.body.id, { mapping: { Email: 'email' }, topics: ['news'], tags: [] });
    await drain();
    await commit(W, up.body.id, 1);
    await drain();
    expect(await contact(W, 'gone@example.com')).toBeNull();
    expect((await contact(W, 'partial@example.com'))!.topics).toEqual([]);
    expect((await get(W, up.body.id)).body.result).toMatchObject({ suppressed: 1, created: 1, topics_withheld: 1 });
    const blocks = await h.sql`SELECT 1 FROM suppressions WHERE workspace_id = ${W.id}`;
    expect(blocks).toHaveLength(2);
  });
});

describe('CSV import, backtrack and revise', () => {
  it('a new mapping discards the dry run; only the dry run of the current version commits', async () => {
    const { W } = await workspace();
    const up = await upload(W, 'Email,Name\na1@example.com,Ann\na2@example.com,Bob\na3@example.com,Cy\n');
    const id = up.body.id;
    await map(W, id, { mapping: { Email: 'email', Name: 'first_name' }, tags: [] });
    await drain();
    expect((await get(W, id)).body).toMatchObject({ status: 'validated', mapping_version: 1 });

    const revised = await map(W, id, { mapping: { Email: 'email', Name: 'ignore' }, topics: ['events'], tags: ['founders'] });
    expect(revised.status).toBe(202);
    expect(revised.body).toMatchObject({ status: 'validating', mapping_version: 2, dry_run: null, processed_rows: 0 });
    // Before the new dry run finished, nothing commits.
    const early = await commit(W, id, 2);
    expect(early.status).toBe(409);
    expect(early.body.error.details).toMatchObject({ status: 'validating', mapping_version: 2 });
    const rowsWhileValidating = await h.call({ path: `/v1/imports/${id}/rows`, key: W.key });
    expect(rowsWhileValidating.body.data).toEqual([]);

    await drain();
    const stale = await commit(W, id, 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'conflict', details: { status: 'validated', mapping_version: 2 } });

    expect((await commit(W, id, 2)).status).toBe(202);
    await drain();
    const a1 = (await contact(W, 'a1@example.com'))!;
    expect(a1).toMatchObject({ first_name: null, topics: ['events'], tags: ['founders'] });
  });

  it('keeping the same mapping yields the same dry run again', async () => {
    const { W } = await workspace();
    const up = await upload(W, 'Email\nb1@example.com\n');
    await map(W, up.body.id, { mapping: { Email: 'email' }, tags: [] });
    await drain();
    const first = (await get(W, up.body.id)).body.dry_run;
    await map(W, up.body.id, { mapping: { Email: 'email' }, tags: [] });
    await drain();
    expect((await get(W, up.body.id)).body).toMatchObject({ mapping_version: 2, dry_run: first });
  });
});

describe('CSV import, resume after a crash', () => {
  it('a batch that dies halfway is rolled back and resumed, every row applied exactly once, also by a new process', async () => {
    const { W, news, events } = await workspace();
    const csv = ['Email', ...Array.from({ length: 7 }, (_, i) => `r${i + 1}@example.com`)].join('\n');
    const up = await upload(W, csv);
    const id = up.body.id;
    await map(W, id, { mapping: { Email: 'email' }, tags: [] });
    await drain();
    await commit(W, id, 1);

    // Batches of 2: rows 1-2 commit, then row 3 is written and the process "dies" before the batch commits.
    let crashed = false;
    const errors = await drain({
      afterRowWritten: (_id, row) => {
        if (row === 3 && !crashed) {
          crashed = true;
          throw new Error('simulated crash');
        }
      },
    });
    expect(crashed).toBe(true);
    expect(errors).toHaveLength(1);
    const midway = await get(W, id);
    expect(midway.body).toMatchObject({ status: 'committing', processed_rows: 2 });
    expect(await contact(W, 'r3@example.com')).toBeNull();
    const [state] = await h.sql<{ failures: number }[]>`SELECT failures FROM import_jobs WHERE id = ${id}`;
    expect(state!.failures).toBe(1);

    // A restart: a new app and a new worker, after the backoff.
    h.restartApp();
    await drain({}, new Date(Date.now() + 60_000));
    const done = await get(W, id);
    expect(done.body).toMatchObject({ status: 'completed', processed_rows: 7, result: { created: 7, updated: 0, unchanged: 0 } });
    const contacts = await h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM contacts WHERE workspace_id = ${W.id}`;
    expect(contacts[0]!.n).toBe(7);
    const records = await h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM contact_consents WHERE workspace_id = ${W.id}`;
    expect(records[0]!.n).toBe(7 * 2);
    for (const c of await h.sql<{ topic_id: string }[]>`SELECT DISTINCT topic_id FROM contact_consents WHERE workspace_id = ${W.id}`) {
      expect([news.id, events.id]).toContain(c.topic_id);
    }
    expect(await eventsOf(W, 'import.finished')).toHaveLength(1);
  });

  it('a batch that keeps failing fails the import, and says why', async () => {
    const { W } = await workspace();
    const up = await upload(W, 'Email\nf1@example.com\nf2@example.com\nf3@example.com\n');
    const id = up.body.id;
    await map(W, id, { mapping: { Email: 'email' }, tags: [] });
    await drain();
    await commit(W, id, 1);
    const alwaysFail = { maxFailures: 2, afterRowWritten: () => { throw new Error('disk on fire'); } };
    await drain(alwaysFail);
    await drain(alwaysFail, new Date(Date.now() + 3_600_000));
    const failed = await get(W, id);
    expect(failed.body.status).toBe('failed');
    expect(failed.body.error).toMatch(/2 failed attempts.*disk on fire/);
    const [event] = await eventsOf(W, 'import.finished');
    expect(event!.payload.data).toMatchObject({ status: 'failed', error: failed.body.error });
    expect(await contact(W, 'f1@example.com')).toBeNull();
  });
});

describe('CSV import, re-entry', () => {
  it('importing the same file again changes nothing, and a finished import accepts no step', async () => {
    const { W } = await workspace();
    const run = async () => {
      const up = await upload(W, CSV);
      await map(W, up.body.id);
      await drain();
      await commit(W, up.body.id, 1);
      await drain();
      return up.body.id as string;
    };
    const first = await run();
    expect((await get(W, first)).body.result).toMatchObject({ created: 5 });
    const second = await run();
    const again = (await get(W, second)).body;
    expect(again.dry_run).toMatchObject({ created: 0, updated: 0 });
    expect(again.result).toMatchObject({ created: 0, updated: 0, unchanged: 5 });

    expect((await commit(W, second, 1)).status).toBe(409);
    expect((await map(W, second)).status).toBe(409);
    const cancel = await h.call({ method: 'POST', path: `/v1/imports/${second}/cancel`, key: W.key, body: {} });
    expect(cancel.status).toBe(409);
  });

  it('cancelling stops the dry run or the commit and keeps what was written', async () => {
    const { W } = await workspace();
    const early = await upload(W, 'Email\nc0@example.com\n');
    await map(W, early.body.id, { mapping: { Email: 'email' }, tags: [] });
    const cancelled = await h.call({ method: 'POST', path: `/v1/imports/${early.body.id}/cancel`, key: W.key, body: {} });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', result: null });
    await drain();
    expect((await get(W, early.body.id)).body.status).toBe('cancelled');

    const up = await upload(W, 'Email\nc1@example.com\nc2@example.com\nc3@example.com\nc4@example.com\n');
    const id = up.body.id;
    await map(W, id, { mapping: { Email: 'email' }, tags: [] });
    await drain();
    await commit(W, id, 1);
    // One batch of two rows, then the cancel.
    await createImportJob({ sql: h.sql, batchSize: 2 }).tick(new Date());
    const stop = await h.call({ method: 'POST', path: `/v1/imports/${id}/cancel`, key: W.key, body: {} });
    expect(stop.body).toMatchObject({ status: 'cancelled', processed_rows: 2, result: { created: 2 } });
    await drain();
    expect(await contact(W, 'c3@example.com')).toBeNull();
    expect(await contact(W, 'c1@example.com')).not.toBeNull();
    const events = await eventsOf(W, 'import.finished');
    expect(events.map((e) => e.payload.data.status)).toEqual(['cancelled', 'cancelled']);
    expect(events[1]!.payload.data.result).toMatchObject({ created: 2 });
  });
});

describe('CSV import, validation', () => {
  it('refuses files it cannot read, with the reason', async () => {
    const { W } = await workspace();
    for (const [csv, reason] of [
      ['', /empty/],
      ['Email,Email\na,b\n', /twice/],
      ['Email\n', /no data rows/],
    ] as const) {
      const res = await upload(W, csv);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.message).toMatch(reason);
    }
    const notUtf8 = new FormData();
    notUtf8.set('file', new File([new Uint8Array([0x45, 0xe4, 0x0a, 0x61])], 'x.csv'));
    const res = await h.call({ method: 'POST', path: '/v1/imports', key: W.key, form: notUtf8 });
    expect(res.body.error.message).toMatch(/UTF-8/);
    const json = await h.call({ method: 'POST', path: '/v1/imports', key: W.key, body: { file: 'x' } });
    expect(json.body.error.code).toBe('invalid_request');
  });

  it('checks the mapping against the file, the topics and the tags', async () => {
    const { W } = await workspace();
    const up = await upload(W, 'Email,Name\na@example.com,A\n');
    const id = up.body.id;
    const bad = await map(W, id, { mapping: { Email: 'email', Nope: 'first_name', Name: 'first_name' }, tags: ['founders', 'ghosts'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.issues.map((i: any) => i.path.join('.'))).toEqual(['mapping.Nope', 'tags.1']);
    const dup = await map(W, id, { mapping: { Email: 'email', Name: 'email' } });
    expect(dup.status).toBe(400);
    const topic = await map(W, id, { mapping: { Email: 'email' }, topics: ['nope'], tags: [] });
    expect(topic.status).toBe(422);
    expect(topic.body.error).toMatchObject({ code: 'unknown_topic', details: { topics: ['nope'] } });
    const noConsent = await map(W, id, { mapping: { Email: 'email' }, consent_confirmed: false });
    expect(noConsent.status).toBe(400);
    expect((await get(W, id)).body).toMatchObject({ status: 'uploaded', mapping_version: 0 });
    const cursor = await h.call({ path: `/v1/imports/${id}/rows?cursor=abc`, key: W.key });
    expect(cursor.body.error.code).toBe('invalid_cursor');
    expect((await h.call({ path: '/v1/imports/not-a-uuid', key: W.key })).status).toBe(404);
  });
});

describe('CSV import, tenancy', () => {
  it('another workspace can neither see nor drive an import, and a revoked key is refused', async () => {
    const { W: A } = await workspace();
    const { W: B } = await workspace();
    const up = await upload(A, 'Email\nt@example.com\n');
    const id = up.body.id;
    const other = B.key;
    expect((await get(A, id, other)).status).toBe(404);
    expect((await map(A, id, { mapping: { Email: 'email' }, topics: [], tags: [] }, other)).status).toBe(404);
    expect((await commit(A, id, 1, other)).status).toBe(404);
    expect((await h.call({ method: 'POST', path: `/v1/imports/${id}/cancel`, key: other, body: {} })).status).toBe(404);
    expect((await h.call({ path: `/v1/imports/${id}/rows`, key: other })).status).toBe(404);
    const list = await h.call({ path: '/v1/imports', key: other });
    expect(list.body.data.map((j: any) => j.id)).not.toContain(id);
    expect((await get(A, id)).body.status).toBe('uploaded');

    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'short-lived' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${created.body.api_key.id}`, key: A.key });
    const revoked = created.body.key as string;
    for (const res of [await upload(A, 'Email\nx@example.com\n', 'x.csv', revoked), await get(A, id, revoked), await map(A, id, {}, revoked)]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('api_key_revoked');
    }
    const readOnly = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'reader', scope: 'read' } });
    const refused = await upload(A, 'Email\nx@example.com\n', 'x.csv', readOnly.body.key);
    expect(refused.status).toBe(403);
    expect((await get(A, id, readOnly.body.key)).status).toBe(200);
  });
});
