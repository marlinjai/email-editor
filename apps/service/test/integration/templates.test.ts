import { MAX_DOCUMENT_BYTES } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brokenSpacerDocument, heavyDocument, helloDocument, textBlock, documentWith } from '../support/documents.js';
import { startHarness, type Harness } from '../support/harness.js';

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('tpl');
});
afterAll(() => h?.drop());

async function create(name = 'Welcome', document: unknown = helloDocument()) {
  const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name, document } });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; version: number; document: any; name: string };
}

function save(id: string, body: Record<string, unknown>) {
  return h.call({ method: 'PUT', path: `/v1/templates/${id}`, key: W.key, body });
}

describe('templates: create, read, list, delete', () => {
  it('creates at version 1 with the document stored as sent, and records version 1', async () => {
    const t = await create('Created');
    expect(t.version).toBe(1);
    expect(t.document).toEqual(helloDocument());
    const versions = await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key });
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([1]);
    const got = await h.call({ path: `/v1/templates/${t.id}`, key: W.key });
    expect(got.body).toEqual(t);
  });

  it('lists without documents, newest change first, and filters by archived', async () => {
    const a = await create('List A');
    const b = await create('List B');
    await save(a.id, { base_version: 1, archived: true });
    const all = await h.call({ path: '/v1/templates?limit=100', key: W.key });
    expect(all.body.data[0]).not.toHaveProperty('document');
    const ids = all.body.data.map((t: { id: string }) => t.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    const archived = await h.call({ path: '/v1/templates?archived=true&limit=100', key: W.key });
    expect(archived.body.data.map((t: { id: string }) => t.id)).toContain(a.id);
    expect(archived.body.data.map((t: { id: string }) => t.id)).not.toContain(b.id);
    const active = await h.call({ path: '/v1/templates?archived=false&limit=100', key: W.key });
    expect(active.body.data.map((t: { id: string }) => t.id)).not.toContain(a.id);
  });

  it('pages with a cursor and refuses a foreign one', async () => {
    const first = await h.call({ path: '/v1/templates?limit=1', key: W.key });
    expect(first.body.data).toHaveLength(1);
    expect(first.body.next_cursor).toBe(first.body.data[0].id);
    const second = await h.call({ path: `/v1/templates?limit=1&cursor=${first.body.next_cursor}`, key: W.key });
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    const bad = await h.call({ path: '/v1/templates?cursor=00000000-0000-4000-8000-000000000000', key: W.key });
    expect(bad.body.error.code).toBe('invalid_cursor');
  });

  it('deletes a template with its history, once', async () => {
    const t = await create('Doomed');
    const del = await h.call({ method: 'DELETE', path: `/v1/templates/${t.id}`, key: W.key });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });
    expect((await h.call({ path: `/v1/templates/${t.id}`, key: W.key })).status).toBe(404);
    expect((await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: `/v1/templates/${t.id}`, key: W.key })).status).toBe(404);
    const count = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM template_versions WHERE template_id = ${t.id}`)[0]!.count;
    expect(count).toBe(0);
  });

  it('writes an audit row for create, update and delete', async () => {
    const t = await create('Audited');
    await save(t.id, { base_version: 1, name: 'Audited 2' });
    await h.call({ method: 'DELETE', path: `/v1/templates/${t.id}`, key: W.key });
    const log = await h.call({ path: `/v1/audit-log?target_id=${t.id}`, key: W.key });
    expect(log.body.data.map((e: { action: string }) => e.action)).toEqual(['template.deleted', 'template.updated', 'template.created']);
  });

  it('answers not_found for an id this service never issued', async () => {
    expect((await h.call({ path: '/v1/templates/not-a-uuid', key: W.key })).body.error.code).toBe('not_found');
    expect((await h.call({ path: '/v1/templates/00000000-0000-4000-8000-000000000000', key: W.key })).status).toBe(404);
  });
});

describe('templates: documents are validated before they are stored', () => {
  it('rejects a document that breaks the block schema, with the core reason and the path', async () => {
    const bad = documentWith([{ id: 'x', type: 'text' }]);
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'Bad', document: bad } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.reason).toBe('INVALID_DOCUMENT');
    expect(res.body.error.details.issues[0].path).toEqual(['document', 'sections', 0, 'columns', 0, 'blocks', 0, 'content']);
  });

  it('rejects a document from a newer editor as NEWER_VERSION, naming the version', async () => {
    const newer = { ...helloDocument(), version: '2.0' };
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'Newer', document: newer } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details).toMatchObject({ reason: 'NEWER_VERSION', document_version: '2.0' });
  });

  it('rejects the same on save and on inline compile, and stores nothing', async () => {
    const t = await create('Guarded');
    const newer = { ...helloDocument(), version: '1.1' };
    const saved = await save(t.id, { base_version: 1, document: newer });
    expect(saved.body.error.details.reason).toBe('NEWER_VERSION');
    expect((await h.call({ path: `/v1/templates/${t.id}`, key: W.key })).body.version).toBe(1);
    const compiled = await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: { version: '1.0' } } });
    expect(compiled.status).toBe(400);
    expect(compiled.body.error.code).toBe('validation_failed');
  });

  it('refuses a document over the size limit, and a body over the request limit', async () => {
    const big = heavyDocument(MAX_DOCUMENT_BYTES + 10_000);
    const res = await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: big } });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
    const huge = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, rawBody: JSON.stringify({ name: 'x', document: heavyDocument(1_200_000) }) });
    expect(huge.status).toBe(413);
  });

  it('refuses malformed JSON and a missing name', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, rawBody: '{"name":' });
    expect(res.body.error.code).toBe('invalid_request');
    const noName = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { document: helloDocument() } });
    expect(noName.body.error.code).toBe('validation_failed');
  });
});

describe('templates: optimistic locking', () => {
  it('a save on a stale version is a conflict carrying the current version, and changes nothing', async () => {
    const t = await create('Contended');
    const first = await save(t.id, { base_version: 1, name: 'Editor A' });
    expect(first.body.version).toBe(2);
    const second = await save(t.id, { base_version: 1, name: 'Editor B' });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: 'conflict', details: { current_version: 2 } });
    expect((await h.call({ path: `/v1/templates/${t.id}`, key: W.key })).body.name).toBe('Editor A');
  });

  it('of two saves racing on the same base, exactly one wins', async () => {
    const t = await create('Race');
    const results = await Promise.all([
      save(t.id, { base_version: 1, document: helloDocument('Hi A') }),
      save(t.id, { base_version: 1, document: helloDocument('Hi B') }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const versions = await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key });
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it('a save naming no change besides base_version is refused', async () => {
    const t = await create('Empty save');
    const res = await save(t.id, { base_version: 1 });
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('templates: the stateful editing flow', () => {
  it('forward: create, save, compile', async () => {
    const t = await create('Forward');
    const saved = await save(t.id, { base_version: 1, document: helloDocument('Welcome') });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    const compiled = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key });
    expect(compiled.status).toBe(200);
    expect(compiled.body.errors).toEqual([]);
    expect(compiled.body.html).toContain('Welcome, world');
  });

  it('backtrack and revise: an edit after a compile changes the output and bumps the version; an unchanged save keeps it', async () => {
    const t = await create('Revise', helloDocument('Before'));
    const before = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key, body: {} });
    expect(before.body.html).toContain('Before, world');

    const revised = await save(t.id, { base_version: 1, document: helloDocument('After') });
    expect(revised.body.version).toBe(2);
    const after = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key });
    expect(after.body.html).toContain('After, world');
    expect(after.body.html).not.toContain('Before, world');

    // The same content again, even with its keys in another order, is not a change.
    const doc = helloDocument('After');
    const reordered = { sections: doc.sections, metadata: doc.metadata, version: doc.version };
    const unchanged = await save(t.id, { base_version: 2, document: reordered, name: 'Revise' });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.version).toBe(2);
    const versions = await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key });
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    // The older version still compiles to the older output.
    const old = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key, body: { version: 1 } });
    expect(old.body.html).toContain('Before, world');
  });

  it('resume: after a restart the template, its version and its history are all there', async () => {
    const t = await create('Resume', helloDocument('One'));
    await save(t.id, { base_version: 1, document: helloDocument('Two') });
    h.restartApp();
    const got = await h.call({ path: `/v1/templates/${t.id}`, key: W.key });
    expect(got.body.version).toBe(2);
    expect(got.body.document).toEqual(helloDocument('Two'));
    const v1 = await h.call({ path: `/v1/templates/${t.id}/versions/1`, key: W.key });
    expect(v1.body.document).toEqual(helloDocument('One'));
    // And the lock still holds across the restart.
    expect((await save(t.id, { base_version: 1, name: 'late' })).status).toBe(409);
    expect((await save(t.id, { base_version: 2, name: 'on time' })).body.version).toBe(3);
  });

  it('re-entry: restoring an old version saves it as a new version and never rewrites history', async () => {
    const t = await create('Restore', helloDocument('Original'));
    await save(t.id, { base_version: 1, document: helloDocument('Edited') });
    const v1 = await h.call({ path: `/v1/templates/${t.id}/versions/1`, key: W.key });

    const restored = await save(t.id, { base_version: 2, document: v1.body.document });
    expect(restored.body.version).toBe(3);
    expect(restored.body.document).toEqual(helloDocument('Original'));

    const versions = await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key });
    const byVersion = Object.fromEntries(versions.body.data.map((v: { version: number; document: unknown }) => [v.version, v.document]));
    expect(byVersion[1]).toEqual(helloDocument('Original'));
    expect(byVersion[2]).toEqual(helloDocument('Edited'));
    expect(byVersion[3]).toEqual(helloDocument('Original'));
    const compiled = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key });
    expect(compiled.body.html).toContain('Original, world');
  });

  it('history is append-only in the database itself', async () => {
    const t = await create('Immutable');
    await expect(h.sql`UPDATE template_versions SET created_by = 'tamper' WHERE template_id = ${t.id}`).rejects.toThrow(/immutable/);
  });

  it('records who saved each version', async () => {
    const t = await create('Authored');
    await h.call({ method: 'PUT', path: `/v1/templates/${t.id}`, subject: W.owner, workspace: W.id, body: { base_version: 1, name: 'By a person' } });
    const versions = await h.call({ path: `/v1/templates/${t.id}/versions`, key: W.key });
    const [v2, v1] = versions.body.data;
    expect(v1.created_by).toBe(`api_key:${W.keyId}`);
    expect(v2.created_by).toMatch(/^member:[0-9a-f-]{36}$/);
  });

  it('pages versions newest first and answers not_found for a missing one', async () => {
    const t = await create('Paged');
    for (let v = 1; v <= 3; v++) await save(t.id, { base_version: v, name: `Paged ${v}` });
    const page1 = await h.call({ path: `/v1/templates/${t.id}/versions?limit=2`, key: W.key });
    expect(page1.body.data.map((v: { version: number }) => v.version)).toEqual([4, 3]);
    expect(page1.body.next_cursor).toBe('3');
    const page2 = await h.call({ path: `/v1/templates/${t.id}/versions?limit=2&cursor=3`, key: W.key });
    expect(page2.body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(page2.body.next_cursor).toBeNull();
    expect((await h.call({ path: `/v1/templates/${t.id}/versions?cursor=abc`, key: W.key })).body.error.code).toBe('invalid_cursor');
    const missing = await h.call({ path: `/v1/templates/${t.id}/versions/99`, key: W.key });
    expect(missing.status).toBe(404);
    const compileMissing = await h.call({ method: 'POST', path: `/v1/templates/${t.id}/compile`, key: W.key, body: { version: 99 } });
    expect(compileMissing.status).toBe(404);
  });
});

describe('compile', () => {
  it('compiles an unsaved document: 200 with mjml, html and no errors', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: helloDocument('Inline') } });
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.mjml).toContain('<mjml>');
    expect(res.body.html).toContain('Inline, world');
  });

  it('a document MJML rejects still answers 200, with the problems in errors and no server path in them', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: brokenSpacerDocument() } });
    expect(res.status).toBe(200);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].message).toMatch(/^mj-spacer: .*height/);
    expect(JSON.stringify(res.body.errors)).not.toContain(process.cwd());
  });

  it('a read-only key may compile and read, but not save', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'reader', scope: 'read' } });
    const reader = created.body.key as string;
    expect((await h.call({ method: 'POST', path: '/v1/compile', key: reader, body: { document: helloDocument() } })).status).toBe(200);
    expect((await h.call({ path: '/v1/templates', key: reader })).status).toBe(200);
    const denied = await h.call({ method: 'POST', path: '/v1/templates', key: reader, body: { name: 'no', document: helloDocument() } });
    expect(denied.status).toBe(403);
  });

  it('a heavy compile does not block the event loop for other requests', async () => {
    const heavy = heavyDocument(MAX_DOCUMENT_BYTES - 50_000);
    const started = Date.now();
    let compileDone = 0;
    const compile = h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: heavy } }).then((r) => {
      compileDone = Date.now();
      return r;
    });

    // While it runs, the event loop keeps turning: timers fire on time and
    // other requests are answered.
    const lags: number[] = [];
    const probes: number[] = [];
    while (compileDone === 0) {
      const t0 = Date.now();
      await new Promise((r) => setTimeout(r, 10));
      lags.push(Date.now() - t0 - 10);
      const p0 = Date.now();
      const health = await h.call({ path: '/healthz' });
      expect(health.status).toBe(200);
      probes.push(Date.now() - p0);
    }
    const result = await compile;
    const compileMs = compileDone - started;

    expect(result.status).toBe(200);
    expect(result.body.errors).toEqual([]);
    expect(result.body.html).toContain('Row 100');
    // The compile takes long enough for this to mean something...
    expect(compileMs).toBeGreaterThan(1_000);
    expect(probes.length).toBeGreaterThan(3);
    // ...and nothing else waited for it. Parsing and validating the 1 MB body
    // happens on the main thread and may cost one short stall; the compile
    // itself costs none.
    const sorted = [...lags].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeLessThan(50);
    expect(Math.max(...probes)).toBeLessThan(Math.max(250, compileMs / 2));
  }, 60_000);
});

describe('templates: tenancy isolation', () => {
  let B: Awaited<ReturnType<Harness['seedWorkspace']>>;
  let bTemplate: { id: string };
  beforeAll(async () => {
    B = await h.seedWorkspace('tpl-other');
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: B.key, body: { name: 'B secret', document: helloDocument('B only') } });
    bTemplate = res.body as { id: string };
  });

  it("workspace A cannot read, list, save, compile, version or delete B's template", async () => {
    const id = bTemplate.id;
    expect((await h.call({ path: `/v1/templates/${id}`, key: W.key })).status).toBe(404);
    expect((await h.call({ path: `/v1/templates/${id}/versions`, key: W.key })).status).toBe(404);
    expect((await h.call({ path: `/v1/templates/${id}/versions/1`, key: W.key })).status).toBe(404);
    expect((await h.call({ method: 'POST', path: `/v1/templates/${id}/compile`, key: W.key })).status).toBe(404);
    expect((await h.call({ method: 'PUT', path: `/v1/templates/${id}`, key: W.key, body: { base_version: 1, name: 'pwned' } })).status).toBe(404);
    expect((await h.call({ method: 'DELETE', path: `/v1/templates/${id}`, key: W.key })).status).toBe(404);
    const list = await h.call({ path: '/v1/templates?limit=100', key: W.key });
    expect(list.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
    expect((await h.call({ path: `/v1/templates?cursor=${id}`, key: W.key })).body.error.code).toBe('invalid_cursor');

    const intact = await h.call({ path: `/v1/templates/${id}`, key: B.key });
    expect(intact.body).toMatchObject({ name: 'B secret', version: 1 });
  });

  it("the dashboard acting in A's workspace cannot reach B's template either", async () => {
    const res = await h.call({ path: `/v1/templates/${bTemplate.id}`, subject: W.owner, workspace: W.id });
    expect(res.status).toBe(404);
    const other = await h.call({ path: `/v1/templates/${bTemplate.id}`, subject: W.owner, workspace: B.id });
    expect(other.status).toBe(403);
  });

  it('a template created by A lands in A only', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'A only', document: documentWith([textBlock('<p>a</p>')]) } });
    const bList = await h.call({ path: '/v1/templates?limit=100', key: B.key });
    expect(bList.body.data.map((t: { id: string }) => t.id)).not.toContain(res.body.id);
  });
});
