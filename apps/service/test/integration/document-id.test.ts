import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';
import { newsletter } from '../support/mail-documents.js';
import { action, addRecipients, createMailing, makeWorker, seedContact, seedSending } from '../support/sending.js';

/**
 * A document's `id` is optional in the contract and in the editor core. The
 * service stores a document exactly as sent, so a document without an id is
 * saved, read back, compiled and sent without one, and an id, once there, is
 * kept verbatim. The editor assigns an id when it opens an id-less document;
 * the first save after that adds it (one version), and later saves keep it.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('doc-id');
});
afterAll(() => h?.drop());

const withoutId = () => {
  const doc = newsletter('No id');
  expect('id' in doc).toBe(false);
  return doc;
};

describe('templates and the document id', () => {
  it('saves, reads, compiles and versions a document without an id, and keeps the id the editor adds', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'No id', document: withoutId() } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect('id' in created.body.document).toBe(false);
    const got = await h.call({ path: `/v1/templates/${created.body.id}`, key: W.key });
    expect(got.body.document).toEqual(withoutId());

    const compiled = await h.call({ method: 'POST', path: `/v1/templates/${created.body.id}/compile`, key: W.key, body: {} });
    expect(compiled.body.errors).toEqual([]);
    expect(compiled.body.html).toContain('No id');

    // The editor opened it, assigned an id, and the host saves what it was handed.
    const edited = { ...withoutId(), id: 'editor-assigned-1' };
    const saved = await h.call({ method: 'PUT', path: `/v1/templates/${created.body.id}`, key: W.key, body: { base_version: 1, document: edited } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.version).toBe(2);
    expect(saved.body.document.id).toBe('editor-assigned-1');
    // The same document again changes nothing: the id is stable, so no new version.
    const again = await h.call({ method: 'PUT', path: `/v1/templates/${created.body.id}`, key: W.key, body: { base_version: 2, document: edited } });
    expect(again.body.version).toBe(2);
    const v1 = await h.call({ path: `/v1/templates/${created.body.id}/versions/1`, key: W.key });
    expect('id' in v1.body.document).toBe(false);
  });

  it('preserves an existing id through create, get, update and the preview compile', async () => {
    const doc = { ...withoutId(), id: 'tpl-doc-42' };
    const created = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'With id', document: doc } });
    expect(created.body.document.id).toBe('tpl-doc-42');
    const updated = await h.call({ method: 'PUT', path: `/v1/templates/${created.body.id}`, key: W.key, body: { base_version: 1, name: 'Renamed' } });
    expect(updated.body.document.id).toBe('tpl-doc-42');
    const preview = await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: withoutId() } });
    expect(preview.body.errors).toEqual([]);
  });

  it('refuses an id that is not a string, with the path', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'Bad id', document: { ...withoutId(), id: 7 } } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.issues[0].path).toEqual(['document', 'id']);
  });
});

describe('mailings and the document id', () => {
  it('creates, sends and delivers a mailing whose document has no id, inline or from a template', async () => {
    const s = await seedSending(h, W.id);
    const c = await seedContact(h, W.id, s.topic.id, { email: 'noid@example.com', first_name: 'Ada' });

    const inline = await createMailing(h, W, { topic: 'news', provider_id: s.provider.id, document: withoutId() });
    expect('id' in inline.document).toBe(false);

    const template = await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'For mailing', document: withoutId() } });
    const fromTemplate = await h.call({
      method: 'POST',
      path: '/v1/mailings',
      key: W.key,
      body: { subject: 'From template', topic: 'news', provider_id: s.provider.id, template_id: template.body.id },
    });
    expect(fromTemplate.status, JSON.stringify(fromTemplate.body)).toBe(201);
    expect(fromTemplate.body.document).toEqual(withoutId());

    for (const m of [inline, fromTemplate.body]) {
      await addRecipients(h, W, m.id, [{ contact_id: c.id }]);
      expect((await action(h, W, m.id, 'test', { to: 'me@studio.test' })).status).toBe(200);
      expect((await action(h, W, m.id, 'send')).status).toBe(202);
    }
    await makeWorker(h).drain();
    for (const m of [inline, fromTemplate.body]) {
      const after = await h.call({ path: `/v1/mailings/${m.id}`, key: W.key });
      expect(after.body.counts.sent, JSON.stringify(after.body.counts)).toBe(1);
    }
  });
});
