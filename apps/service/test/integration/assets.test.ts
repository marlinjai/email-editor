import { MAX_ASSET_BYTES } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_BASE_URL, startHarness, type Harness } from '../support/harness.js';
import { gifBytes, jpegBytes, pngBytes, webpBytes } from '../support/images.js';

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('assets');
});
afterAll(() => h?.drop());

function form(bytes: Buffer, filename: string, type: string, field = 'file'): FormData {
  const f = new FormData();
  f.append(field, new Blob([bytes], { type }), filename);
  return f;
}

function upload(bytes: Buffer, filename = 'hero.png', type = 'image/png', extra: Partial<Parameters<Harness['call']>[0]> = {}) {
  return h.call({ method: 'POST', path: '/v1/assets', key: W.key, form: form(bytes, filename, type), ...extra });
}

/** Fetches the public URL with the raw response, since the body is binary. */
async function fetchPublic(url: string, headers: Record<string, string> = {}) {
  const path = new URL(url).pathname;
  return h.app.request(path, { headers });
}

describe('assets: upload', () => {
  it('stores an image and answers with a stable public URL, the sniffed type and the size', async () => {
    const bytes = pngBytes(600, 300);
    const res = await upload(bytes, 'hero.png', 'image/png');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      url: `${PUBLIC_BASE_URL}/a/${res.body.id}`,
      content_type: 'image/png',
      size_bytes: bytes.length,
      width: 600,
      height: 300,
      filename: 'hero.png',
    });
    const got = await h.call({ path: `/v1/assets/${res.body.id}`, key: W.key });
    expect(got.body).toEqual(res.body);
    const log = await h.call({ path: `/v1/audit-log?target_id=${res.body.id}`, key: W.key });
    expect(log.body.data.map((e: { action: string }) => e.action)).toEqual(['asset.uploaded']);
  });

  it('trusts the bytes, not the name or the declared type', async () => {
    const res = await upload(jpegBytes(40, 30), 'photo.png', 'image/png');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content_type: 'image/jpeg', filename: 'photo.jpg', width: 40, height: 30 });
  });

  it('accepts GIF and WebP', async () => {
    expect((await upload(gifBytes(2, 2), 'a.gif', 'image/gif')).body.content_type).toBe('image/gif');
    expect((await upload(webpBytes('VP8X', 10, 20), 'a.webp', 'image/webp')).body.content_type).toBe('image/webp');
  });

  it('refuses a non-image whatever it claims to be, and stores nothing', async () => {
    const before = h.storage.files.size;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await upload(svg, 'logo.png', 'image/png');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('unsupported_media_type');
    expect(res.body.error.details.declared_type).toBe('image/png');
    const exe = await upload(Buffer.from('MZ\x90\0\x03'), 'cat.jpg', 'image/jpeg');
    expect(exe.body.error.code).toBe('unsupported_media_type');
    expect(h.storage.files.size).toBe(before);
  });

  it('refuses a file over the size limit', async () => {
    const big = Buffer.concat([pngBytes(1, 1), Buffer.alloc(MAX_ASSET_BYTES)]);
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('accepts a file right at the size limit (the JSON body limit does not apply to uploads)', async () => {
    const exact = Buffer.concat([pngBytes(1, 1), Buffer.alloc(MAX_ASSET_BYTES - 33)]);
    expect(exact.length).toBe(MAX_ASSET_BYTES);
    const res = await upload(exact);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.size_bytes).toBe(MAX_ASSET_BYTES);
  });

  it('refuses an empty file, a missing file field, two files, and a JSON body', async () => {
    expect((await upload(Buffer.alloc(0))).body.error.code).toBe('validation_failed');
    const wrongField = await h.call({ method: 'POST', path: '/v1/assets', key: W.key, form: form(pngBytes(1, 1), 'a.png', 'image/png', 'image') });
    expect(wrongField.body.error.code).toBe('validation_failed');
    const two = form(pngBytes(1, 1), 'a.png', 'image/png');
    two.append('file', new Blob([pngBytes(1, 1)], { type: 'image/png' }), 'b.png');
    expect((await h.call({ method: 'POST', path: '/v1/assets', key: W.key, form: two })).body.error.code).toBe('validation_failed');
    const json = await h.call({ method: 'POST', path: '/v1/assets', key: W.key, body: { file: 'x' } });
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe('invalid_request');
  });

  it('a read-only key cannot upload', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'reader', scope: 'read' } });
    const res = await upload(pngBytes(1, 1), 'a.png', 'image/png', { key: created.body.key });
    expect(res.status).toBe(403);
  });

  it('when the image store is down the upload fails as retryable and leaves no row', async () => {
    h.storage.failNext = 'put';
    const before = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM assets`)[0]!.count;
    const res = await upload(pngBytes(5, 5));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('service_unavailable');
    const after = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM assets`)[0]!.count;
    expect(after).toBe(before);
  });

  it('with an Idempotency-Key, a retried upload (a new multipart boundary) replays the first answer and stores once', async () => {
    const bytes = pngBytes(7, 7);
    const before = h.storage.files.size;
    const first = await upload(bytes, 'retry.png', 'image/png', { idempotencyKey: 'upload-1' });
    const retry = await upload(bytes, 'retry.png', 'image/png', { idempotencyKey: 'upload-1' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
    expect(retry.body.id).toBe(first.body.id);
    expect(h.storage.files.size).toBe(before + 1);
    const other = await upload(pngBytes(8, 8), 'retry.png', 'image/png', { idempotencyKey: 'upload-1' });
    expect(other.body.error.code).toBe('idempotency_key_reused');
  });
});

describe('assets: the public URL', () => {
  let asset: { id: string; url: string; size_bytes: number };
  let bytes: Buffer;
  beforeAll(async () => {
    bytes = pngBytes(123, 45);
    asset = (await upload(bytes, 'public.png', 'image/png')).body as typeof asset;
  });

  it('serves the bytes with the stored type, the length, and a long immutable cache', async () => {
    const res = await fetchPublic(asset.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-length')).toBe(String(bytes.length));
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it('needs no credentials and reads the store on every request (no expiring URL is ever handed out)', async () => {
    const opens = h.storage.opens;
    await fetchPublic(asset.url);
    await fetchPublic(asset.url);
    expect(h.storage.opens).toBe(opens + 2);
  });

  it('answers 304 to a matching If-None-Match without touching the store', async () => {
    const first = await fetchPublic(asset.url);
    const etag = first.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const opens = h.storage.opens;
    const again = await fetchPublic(asset.url, { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(h.storage.opens).toBe(opens);
  });

  it('answers 404 for an unknown or malformed id, briefly cached', async () => {
    const unknown = await h.app.request('/a/00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('cache-control')).toBe('public, max-age=60');
    expect((await h.app.request('/a/../../etc/hosts')).status).toBe(404);
    expect((await h.app.request('/a/nope')).status).toBe(404);
  });

  it('answers 503, not cached, when the store is unreachable, and logs it', async () => {
    h.storage.failNext = 'open';
    const errors = h.errors.length;
    const res = await fetchPublic(asset.url);
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('30');
    expect(h.errors.length).toBeGreaterThan(errors);
    expect((await fetchPublic(asset.url)).status).toBe(200);
  });

  it('answers 404 and logs when the row exists but the store lost the file', async () => {
    const lost = (await upload(pngBytes(3, 3), 'lost.png', 'image/png')).body;
    const [row] = await h.sql<{ storage_file_id: string }[]>`SELECT storage_file_id FROM assets WHERE id = ${lost.id}`;
    h.storage.files.delete(row!.storage_file_id);
    const errors = h.errors.length;
    expect((await fetchPublic(lost.url)).status).toBe(404);
    expect(h.errors.length).toBeGreaterThan(errors);
  });

  it('keeps serving after a service restart', async () => {
    h.restartApp();
    const res = await fetchPublic(asset.url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });
});

describe('assets: tenancy isolation', () => {
  it("workspace A cannot read B's asset metadata; the public URL is the only shared surface", async () => {
    const B = await h.seedWorkspace('assets-other');
    const bAsset = (await h.call({ method: 'POST', path: '/v1/assets', key: B.key, form: form(pngBytes(9, 9), 'b.png', 'image/png') })).body;
    expect((await h.call({ path: `/v1/assets/${bAsset.id}`, key: W.key })).status).toBe(404);
    expect((await h.call({ path: `/v1/assets/${bAsset.id}`, subject: W.owner, workspace: W.id })).status).toBe(404);
    expect((await h.call({ path: `/v1/assets/${bAsset.id}`, key: B.key })).status).toBe(200);
    // An upload by A is A's: B cannot see it.
    const aAsset = (await upload(pngBytes(4, 4))).body;
    expect((await h.call({ path: `/v1/assets/${aAsset.id}`, key: B.key })).status).toBe(404);
    // The public response names no workspace.
    const pub = await fetchPublic(bAsset.url);
    expect([...pub.headers.entries()].flat().join(' ')).not.toContain(B.id);
  });

  it('stores each upload under its own workspace in the image store', async () => {
    const res = await upload(pngBytes(6, 6));
    const [row] = await h.sql<{ storage_file_id: string }[]>`SELECT storage_file_id FROM assets WHERE id = ${res.body.id}`;
    expect(h.storage.files.get(row!.storage_file_id)?.workspaceId).toBe(W.id);
  });
});
