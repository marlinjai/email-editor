import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AssetStorageUnavailable, StorageBrainAssetStorage } from '../../src/assets/storage.js';
import { pngBytes } from '../support/images.js';

/**
 * The Storage Brain adapter against a local stand-in speaking the Storage Brain
 * v1 API as the SDK calls it: upload handshake, the PUT of the bytes, file info,
 * signed URLs, the signed download and delete.
 */
const KEY = `sk_test_${'k'.repeat(32)}`;
type Stored = { bytes: Buffer; type: string; name: string; context: string; tags: Record<string, string> };
const files = new Map<string, Stored>();
const pending = new Map<string, Omit<Stored, 'bytes'>>();
let signedFor: string[] = [];
let down = false;
let server: Server;
let base: string;

async function read(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (down) return json(503, { error: { code: 'UNAVAILABLE', message: 'down' } });
    // The signed download is the one unauthenticated call.
    const download = /^\/api\/v1\/files\/([\w-]+)\/download$/.exec(url.pathname);
    if (download && req.method === 'GET') {
      if (url.searchParams.get('token') !== 'signed') return json(403, { error: { code: 'FORBIDDEN', message: 'bad token' } });
      const f = files.get(download[1]!);
      if (!f) return json(404, { error: { code: 'NOT_FOUND', message: 'gone' } });
      res.writeHead(200, { 'content-type': f.type });
      return res.end(f.bytes);
    }
    if (req.headers.authorization !== `Bearer ${KEY}`) return json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } });
    if (url.pathname === '/api/v1/upload/request' && req.method === 'POST') {
      const body = JSON.parse((await read(req)).toString());
      const fileId = `f_${files.size + pending.size + 1}`;
      pending.set(fileId, { type: body.fileType, name: body.fileName, context: body.context, tags: body.tags });
      return json(200, { fileId, presignedUrl: `/api/v1/upload/${fileId}`, expiresAt: new Date().toISOString(), uploadMetadata: {} });
    }
    const put = /^\/api\/v1\/upload\/([\w-]+)$/.exec(url.pathname);
    if (put && req.method === 'PUT') {
      const meta = pending.get(put[1]!)!;
      pending.delete(put[1]!);
      files.set(put[1]!, { ...meta, bytes: await read(req) });
      return json(200, { processingStatus: 'completed' });
    }
    const signed = /^\/api\/v1\/files\/([\w-]+)\/signed-url$/.exec(url.pathname);
    if (signed) {
      if (!files.has(signed[1]!)) return json(404, { error: { code: 'FILE_NOT_FOUND', message: 'no file', details: { fileId: signed[1] } } });
      signedFor.push(signed[1]!);
      return json(200, { fileId: signed[1], url: `${base}/api/v1/files/${signed[1]}/download?token=signed`, expiresAt: '', expiresIn: 300 });
    }
    const file = /^\/api\/v1\/files\/([\w-]+)$/.exec(url.pathname);
    if (file && req.method === 'GET') {
      const f = files.get(file[1]!);
      if (!f) return json(404, { error: { code: 'FILE_NOT_FOUND', message: 'no file' } });
      return json(200, { id: file[1], url: '', originalName: f.name, fileType: f.type, sizeBytes: f.bytes.length, context: f.context, tags: f.tags, metadata: null, processingStatus: 'completed', workspaceId: null, createdAt: new Date().toISOString() });
    }
    if (file && req.method === 'DELETE') {
      if (!files.delete(file[1]!)) return json(404, { error: { code: 'FILE_NOT_FOUND', message: 'no file' } });
      return json(200, { success: true });
    }
    json(404, { error: { code: 'NOT_FOUND', message: 'no route' } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  files.clear();
  pending.clear();
  signedFor = [];
  down = false;
});

const store = () => new StorageBrainAssetStorage({ apiKey: KEY, baseUrl: base });

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

describe('StorageBrainAssetStorage', () => {
  it('uploads the bytes labelled with the owning workspace, and reads them back through a fresh signed URL each time', async () => {
    const bytes = pngBytes(20, 10);
    const { fileId } = await store().put({ workspaceId: 'ws-1', assetId: 'as-1', bytes, contentType: 'image/png', filename: 'a.png' });
    expect(files.get(fileId)).toMatchObject({
      type: 'image/png',
      name: 'a.png',
      context: 'mail/ws-1',
      tags: { service: 'lumitra-mail', workspace: 'ws-1', asset: 'as-1' },
    });
    expect(files.get(fileId)!.bytes.equals(bytes)).toBe(true);

    const first = await store().open(fileId);
    expect((await readAll(first!)).equals(bytes)).toBe(true);
    await readAll((await store().open(fileId))!);
    expect(signedFor).toEqual([fileId, fileId]);
  });

  it('answers null for a file the store does not have', async () => {
    expect(await store().open('f_missing')).toBeNull();
  });

  it('turns an unreachable or failing store into AssetStorageUnavailable', async () => {
    down = true;
    const s = new StorageBrainAssetStorage({ apiKey: KEY, baseUrl: base });
    await expect(s.put({ workspaceId: 'w', assetId: 'a', bytes: pngBytes(1, 1), contentType: 'image/png', filename: 'a.png' })).rejects.toBeInstanceOf(AssetStorageUnavailable);
    await expect(s.open('f_1')).rejects.toBeInstanceOf(AssetStorageUnavailable);
    const nowhere = new StorageBrainAssetStorage({ apiKey: KEY, baseUrl: 'http://127.0.0.1:1' });
    await expect(nowhere.open('f_1')).rejects.toBeInstanceOf(AssetStorageUnavailable);
  }, 20_000);

  it('a wrong key is a failure, never mistaken for a missing file', async () => {
    const s = new StorageBrainAssetStorage({ apiKey: `sk_test_${'w'.repeat(32)}`, baseUrl: base });
    await expect(s.open('f_1')).rejects.toBeInstanceOf(AssetStorageUnavailable);
  });

  it('removes a file, and treats an already missing one as removed', async () => {
    const { fileId } = await store().put({ workspaceId: 'w', assetId: 'a', bytes: pngBytes(1, 1), contentType: 'image/png', filename: 'a.png' });
    await store().remove(fileId);
    expect(files.has(fileId)).toBe(false);
    await expect(store().remove(fileId)).resolves.toBeUndefined();
  });
});
