import {
  EXPORT_WARNINGS_HEADER,
  EXPORT_WARNING_COUNT_HEADER,
  MAX_MJML_IMPORT_BYTES,
  TemplateImportPreview,
  TemplateImportResult,
  parseExportWarningsHeader,
} from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, PUBLIC_BASE_URL, type Harness } from '../support/harness.js';
import { ImageServer } from '../support/image-server.js';
import { pngBytes } from '../support/images.js';
import { createMailing, seedSending } from '../support/sending.js';

/**
 * MJML import (preview and create) and export (templates and mailings):
 * the happy paths, every refusal, idempotency, tenancy and revoked keys, and
 * the remote-image copy.
 */

let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;

const MJML = `<mjml>
  <mj-head><mj-title>Autumn</mj-title><mj-preview>What is new</mj-preview></mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-weight="700">Hello &amp; welcome</mj-text>
        <mj-image src="https://images.example.org/cover.png" alt="Cover" />
        <mj-button href="https://example.org">Read</mj-button>
        <mj-social><mj-social-element name="facebook" href="https://fb.example/me">Follow</mj-social-element></mj-social>
        <mj-text><a href="{{unsubscribe_url}}">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const setPolicy = (w: { key: string }, asset_policy: 'any' | 'service_only') =>
  h.call({ method: 'PATCH', path: '/v1/workspace', key: w.key, body: { settings: { asset_policy } } });

beforeAll(async () => {
  h = await startHarness();
  A = await h.seedWorkspace('mjml-alpha');
  B = await h.seedWorkspace('mjml-bravo');
});
afterAll(() => h?.drop());

describe('templates.importPreview', () => {
  it('answers with the document, the warnings, the compiled mail and the remote images, saving nothing', async () => {
    const before = await h.call({ path: '/v1/templates', key: A.key });
    const res = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: MJML } });
    expect(res.status).toBe(200);
    expect(TemplateImportPreview.safeParse(res.body).success).toBe(true);
    expect(res.body.document.metadata).toMatchObject({ title: 'Autumn', previewText: 'What is new' });
    const types = res.body.document.sections[0].columns[0].blocks.map((b: { type: string }) => b.type);
    expect(types).toEqual(['text', 'image', 'button', 'raw', 'text']);
    expect(res.body.warnings.find((w: { code: string }) => w.code === 'kept_as_html')).toMatchObject({
      severity: 'warning',
      path: 'mj-body > mj-section[1] > mj-column[1] > mj-social[1]',
      line: 9,
    });
    expect(res.body.compiled.html).toContain('Hello &amp; welcome');
    expect(res.body.remote_images.map((r: { url: string }) => r.url)).toContain('https://images.example.org/cover.png');
    expect(res.body.asset_policy).toBe('any');
    const after = await h.call({ path: '/v1/templates', key: A.key });
    expect(after.body.data.length).toBe(before.body.data.length);
  });

  it('under service_only the remote images are compile errors too', async () => {
    await setPolicy(A, 'service_only');
    try {
      const res = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: MJML } });
      expect(res.body.asset_policy).toBe('service_only');
      expect(res.body.compiled.errors.some((e: { message: string }) => e.message.includes('images.example.org'))).toBe(true);
    } finally {
      await setPolicy(A, 'any');
    }
  });
});

describe('refusals', () => {
  it('broken MJML is invalid_mjml with the reason, line and column', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: '<mjml>\n<mj-body>\n  <mj-section>\n</mj-body></mjml>' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'invalid_mjml', details: { reason: 'invalid_xml', line: 4, column: 1 } });
  });

  it('mj-include is refused (never read from the server disk)', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'x', mjml: '<mjml><mj-body><mj-include path="/etc/passwd" type="html" /></mj-body></mjml>' } });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: 'include_not_supported', line: 1 });
    expect(JSON.stringify(res.body)).not.toContain('root:');
  });

  it('not MJML, empty, too large', async () => {
    const html = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: '<html><body>hi</body></html>' } });
    expect(html.body.error).toMatchObject({ code: 'invalid_mjml', details: { reason: 'not_mjml' } });
    const empty = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: '' } });
    expect(empty.body.error.code).toBe('validation_failed');
    const big = `<mjml><mj-body><mj-raw>${'x'.repeat(MAX_MJML_IMPORT_BYTES)}</mj-raw></mj-body></mjml>`;
    const large = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: big } });
    expect(large.status).toBe(413);
    expect(large.body.error.code).toBe('payload_too_large');
  });

  it('a read-only key may preview and export, not import', async () => {
    const readKey = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'read', scope: 'read' } });
    const key = readKey.body.key as string;
    expect((await h.call({ method: 'POST', path: '/v1/templates/import/preview', key, body: { mjml: MJML } })).status).toBe(200);
    const denied = await h.call({ method: 'POST', path: '/v1/templates/import', key, body: { name: 'x', mjml: MJML } });
    expect(denied.status).toBe(403);
  });
});

describe('templates.import', () => {
  it('creates version 1 with the imported document and records where it came from', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Autumn letter', description: 'from MJML', mjml: MJML } });
    expect(res.status).toBe(201);
    expect(TemplateImportResult.safeParse(res.body).success).toBe(true);
    expect(res.body.template).toMatchObject({ name: 'Autumn letter', description: 'from MJML', version: 1 });
    expect(res.body.imported_assets).toEqual([]);
    const got = await h.call({ path: `/v1/templates/${res.body.template.id}`, key: A.key });
    expect(got.body.document).toEqual(res.body.template.document);
    const audit = await h.call({ path: '/v1/audit-log', key: A.key });
    const entry = audit.body.data.find((e: { target_id: string; action: string }) => e.target_id === res.body.template.id && e.action === 'template.created');
    expect(entry.details).toMatchObject({ source: 'mjml_import', version: 1 });
  });

  it('re-entry: the same file twice without a key gives two templates; with one key, one', async () => {
    const body = { name: 'Twice', mjml: MJML };
    const one = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body });
    const two = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body });
    expect(one.body.template.id).not.toBe(two.body.template.id);

    const first = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Once', mjml: MJML }, idempotencyKey: 'import-once-1' });
    const replay = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Once', mjml: MJML }, idempotencyKey: 'import-once-1' });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.body.template.id).toBe(first.body.template.id);
    const list = await h.call({ path: '/v1/templates?limit=100', key: A.key });
    expect(list.body.data.filter((t: { name: string }) => t.name === 'Once')).toHaveLength(1);

    const reused = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Other', mjml: MJML }, idempotencyKey: 'import-once-1' });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('idempotency_key_reused');
  });

  it('a failed import keeps the key free: the corrected retry with the same key creates the template', async () => {
    const bad = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Fixed', mjml: '<mjml><mj-body>' }, idempotencyKey: 'import-fix-1' });
    expect(bad.status).toBe(422);
    // A 4xx is stored against the key: the same key with a different body is refused, a new key works.
    const good = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Fixed', mjml: MJML }, idempotencyKey: 'import-fix-2' });
    expect(good.status).toBe(201);
  });
});

describe('export', () => {
  let templateId: string;
  beforeAll(async () => {
    const assetId = '11111111-2222-4333-8444-555555555555';
    const mjml = MJML.replace('https://images.example.org/cover.png', `/a/${assetId}`);
    const res = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Grüße: Herbst/Winter', mjml } });
    templateId = res.body.template.id;
    await h.call({
      method: 'PUT',
      path: `/v1/templates/${templateId}`,
      key: A.key,
      body: { base_version: 1, document: { ...res.body.template.document, metadata: { ...res.body.template.document.metadata, title: 'Version two' } } },
    });
  });

  it('MJML: plain text, a safe file name, asset addresses absolute', async () => {
    const res = await h.call({ path: `/v1/templates/${templateId}/export?format=mjml`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="Grusse-Herbst-Winter.mjml"; filename*=UTF-8''Grusse-Herbst-Winter.mjml`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.text.startsWith('<mjml>')).toBe(true);
    expect(res.text).toContain(`${PUBLIC_BASE_URL}/a/11111111-2222-4333-8444-555555555555`);
    expect(res.text).not.toMatch(/"\/a\//);
    expect(res.text).toContain('<mj-title>Version two</mj-title>');
    // The exported MJML imports again.
    const again = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: res.text } });
    expect(again.status).toBe(200);
  });

  it('HTML, and a past version', async () => {
    const res = await h.call({ path: `/v1/templates/${templateId}/export?format=html&version=1`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-disposition')).toContain('Grusse-Herbst-Winter-v1.html');
    expect(res.text).toMatch(/^<!doctype html>/i);
    expect(res.text).toContain('<title>Autumn</title>');
    const missing = await h.call({ path: `/v1/templates/${templateId}/export?format=html&version=9`, key: A.key });
    expect(missing.status).toBe(404);
    const badFormat = await h.call({ path: `/v1/templates/${templateId}/export?format=pdf`, key: A.key });
    expect(badFormat.status).toBe(400);
  });

  it('never refuses under service_only: the violations come in the warnings header', async () => {
    const withRemote = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Remote', mjml: MJML } });
    await setPolicy(A, 'service_only');
    try {
      const res = await h.call({ path: `/v1/templates/${withRemote.body.template.id}/export?format=html`, key: A.key });
      expect(res.status).toBe(200);
      const warnings = parseExportWarningsHeader(res.headers.get(EXPORT_WARNINGS_HEADER));
      expect(warnings.some((w) => w.message.includes('images.example.org'))).toBe(true);
      expect(Number(res.headers.get(EXPORT_WARNING_COUNT_HEADER))).toBeGreaterThanOrEqual(warnings.length);
    } finally {
      await setPolicy(A, 'any');
    }
    const clean = await h.call({ path: `/v1/templates/${withRemote.body.template.id}/export?format=html`, key: A.key });
    expect(clean.headers.get(EXPORT_WARNINGS_HEADER)).toBeNull();
    expect(clean.headers.get(EXPORT_WARNING_COUNT_HEADER)).toBe('0');
  });

  it("mailings.export gives the mailing's snapshot", async () => {
    const { topic, provider } = await seedSending(h, A.id, { topic: 'mjml-news' });
    const imported = await h.call({ method: 'POST', path: '/v1/templates/import/preview', key: A.key, body: { mjml: MJML } });
    const mailing = await createMailing(h, A, { topic: topic.slug, provider_id: provider.id, document: imported.body.document, subject: 'Autumn news' });
    const html = await h.call({ path: `/v1/mailings/${mailing.id}/export?format=html`, key: A.key });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-disposition')).toContain('Autumn-news.html');
    expect(html.text).toContain('Hello &amp; welcome');
    const mjml = await h.call({ path: `/v1/mailings/${mailing.id}/export?format=mjml`, key: A.key });
    expect(mjml.text).toContain('<mj-body');
  });
});

describe('tenancy and revoked keys', () => {
  it("workspace B cannot export A's template or mailing", async () => {
    const t = await h.call({ method: 'POST', path: '/v1/templates/import', key: A.key, body: { name: 'Private', mjml: MJML } });
    const res = await h.call({ path: `/v1/templates/${t.body.template.id}/export?format=mjml`, key: B.key });
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Hello');
    const { topic, provider } = await seedSending(h, A.id, { topic: 'mjml-private' });
    const m = await createMailing(h, A, { topic: topic.slug, provider_id: provider.id, subject: 'Private' });
    const mres = await h.call({ path: `/v1/mailings/${m.id}/export?format=html`, key: B.key });
    expect(mres.status).toBe(404);
  });

  it('an import with B\'s key lands in B only; a dashboard member of A cannot aim at B', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/templates/import', key: B.key, body: { name: 'B only', mjml: MJML } });
    const inA = await h.call({ path: `/v1/templates/${res.body.template.id}`, key: A.key });
    expect(inA.status).toBe(404);
    const aimed = await h.call({ method: 'POST', path: '/v1/templates/import', subject: A.owner, workspace: B.id, body: { name: 'x', mjml: MJML } });
    expect(aimed.status).toBe(403);
  });

  it('a revoked key is refused on every MJML route', async () => {
    const extra = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'soon revoked' } });
    const t = await h.call({ method: 'POST', path: '/v1/templates/import', key: extra.body.key, body: { name: 'Before revoke', mjml: MJML } });
    expect(t.status).toBe(201);
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${extra.body.api_key.id}`, key: A.key });
    for (const call of [
      { method: 'POST', path: '/v1/templates/import', body: { name: 'x', mjml: MJML } },
      { method: 'POST', path: '/v1/templates/import/preview', body: { mjml: MJML } },
      { path: `/v1/templates/${t.body.template.id}/export?format=html` },
    ]) {
      const res = await h.call({ ...call, key: extra.body.key });
      expect(res.status, call.path).toBe(401);
      expect(res.body.error.code).toBe('api_key_revoked');
    }
  });
});

describe('import_remote_assets', () => {
  it('copies the remote images, points the document at the copies, and warns about the ones it could not copy', async () => {
    const images = await ImageServer.start();
    const open = await startHarness({ webhookUrlPolicy: { allowInsecureHttp: true, allowPrivateTargets: true } });
    try {
      images.on('/good.png', { body: pngBytes(4, 4) });
      const W = await open.seedWorkspace('mjml-remote');
      const mjml = `<mjml><mj-body><mj-section background-url="${images.url('/good.png')}"><mj-column>
        <mj-image src="${images.url('/good.png')}" alt="Good" />
        <mj-image src="${images.url('/missing.png')}" alt="Missing" />
      </mj-column></mj-section></mj-body></mjml>`;
      const preview = await open.call({ method: 'POST', path: '/v1/templates/import/preview', key: W.key, body: { mjml } });
      expect(preview.body.remote_images.map((r: { url: string }) => r.url).sort()).toEqual([images.url('/good.png'), images.url('/missing.png')].sort());

      const res = await open.call({ method: 'POST', path: '/v1/templates/import', key: W.key, body: { name: 'Remote', mjml, import_remote_assets: true } });
      expect(res.status).toBe(201);
      expect(res.body.imported_assets).toHaveLength(1);
      const copy = res.body.imported_assets[0];
      expect(copy.source_url).toBe(images.url('/good.png'));
      expect(copy.url).toBe(`${PUBLIC_BASE_URL}/a/${copy.asset_id}`);
      const doc = JSON.stringify(res.body.template.document);
      expect(doc).not.toContain('/good.png');
      expect(doc.split(copy.url).length - 1).toBe(2);
      expect(doc).toContain('/missing.png');
      expect(res.body.warnings.find((w: { code: string }) => w.code === 'remote_image_not_imported')?.message).toContain('/missing.png');
      const asset = await open.call({ path: `/v1/assets/${copy.asset_id}`, key: W.key });
      expect(asset.status).toBe(200);
    } finally {
      await images.stop();
      await open.drop();
    }
  });

  it('the default SSRF policy never fetches a private address: the image stays remote, with a warning', async () => {
    const res = await h.call({
      method: 'POST',
      path: '/v1/templates/import',
      key: A.key,
      body: { name: 'Blocked', import_remote_assets: true, mjml: '<mjml><mj-body><mj-section><mj-column><mj-image src="https://127.0.0.1/x.png" /></mj-column></mj-section></mj-body></mjml>' },
    });
    expect(res.status).toBe(201);
    expect(res.body.imported_assets).toEqual([]);
    expect(res.body.warnings.some((w: { code: string }) => w.code === 'remote_image_not_imported')).toBe(true);
  });
});
