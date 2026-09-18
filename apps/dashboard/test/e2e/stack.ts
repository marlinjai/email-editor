import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import postgres from 'postgres';
import { generate } from 'selfsigned';
import { SMTPServer } from 'smtp-server';

/**
 * Everything the end-to-end suite runs against, all local and real except the
 * sign-in: Postgres 17 (Testcontainers, or TEST_DATABASE_URL in CI), the mail
 * service as a subprocess of its built `dist/main.js` (API and send worker), a
 * Storage Brain stand-in for image uploads, and an SMTP sink with TLS that the
 * worker delivers to. A control server lets a test read the sink, slow it
 * down, make it refuse addresses, and restart the service mid-send.
 */

export const PORTS = { service: 3910, dashboard: 3920, control: 3930 } as const;
export const SERVICE_URL = `http://127.0.0.1:${PORTS.service}`;
export const CONTROL_URL = `http://127.0.0.1:${PORTS.control}`;
/** Shared by the service and the dashboard under test; a test-only value. */
export const DASHBOARD_TOKEN = 'e2'.repeat(32);
export const SMTP_USER = 'sender@example.com';
export const SMTP_PASSWORD = 'e2e-smtp-password';
const STORAGE_KEY = `sk_test_${'e'.repeat(32)}`;
const REPO = path.resolve(import.meta.dirname, '../../../..');

export type SinkMessage = { to: string[]; raw: string; at: number };

async function read(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const listen = (server: Server | SMTPServer['server'], port = 0) =>
  new Promise<number>((resolve) => server.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

async function startPostgres(): Promise<{ url: string; stop: () => Promise<void> }> {
  const admin = process.env.TEST_DATABASE_URL;
  if (admin) {
    const name = `e2e_${randomBytes(4).toString('hex')}`;
    const sql = postgres(admin, { max: 1, onnotice: () => {} });
    await sql.unsafe(`CREATE DATABASE ${name}`);
    await sql.end();
    const url = new URL(admin);
    url.pathname = `/${name}`;
    return { url: url.toString(), stop: async () => {} };
  }
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:17-alpine').withDatabase('mail').withUsername('mail').withPassword('mail').start();
  return { url: container.getConnectionUri(), stop: async () => void (await container.stop()) };
}

/** The Storage Brain v1 API as the SDK calls it, in memory (the service's own stand-in, apps/service/test/unit/storage-brain.test.ts). */
async function startStorage(): Promise<{ url: string; stop: () => Promise<void> }> {
  type Stored = { bytes: Buffer; type: string };
  const files = new Map<string, Stored>();
  const pending = new Map<string, string>();
  let base = '';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const download = /^\/api\/v1\/files\/([\w-]+)\/download$/.exec(url.pathname);
    if (download && req.method === 'GET') {
      const f = files.get(download[1]!);
      if (!f) return json(404, { error: { code: 'NOT_FOUND', message: 'gone' } });
      res.writeHead(200, { 'content-type': f.type });
      return res.end(f.bytes);
    }
    // The presigned PUT carries its authority in the URL, not a key.
    const put = /^\/api\/v1\/upload\/([\w-]+)$/.exec(url.pathname);
    if (put && req.method === 'PUT') {
      if (!pending.has(put[1]!)) return json(404, { error: { code: 'NOT_FOUND', message: 'no pending upload' } });
      files.set(put[1]!, { type: pending.get(put[1]!)!, bytes: await read(req) });
      pending.delete(put[1]!);
      return json(200, { processingStatus: 'completed' });
    }
    if (req.headers.authorization !== `Bearer ${STORAGE_KEY}`) return json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } });
    if (url.pathname === '/api/v1/upload/request' && req.method === 'POST') {
      const body = JSON.parse((await read(req)).toString());
      const fileId = `f_${randomBytes(6).toString('hex')}`;
      pending.set(fileId, body.fileType);
      return json(200, { fileId, presignedUrl: `${base}/api/v1/upload/${fileId}`, expiresAt: new Date().toISOString(), uploadMetadata: {} });
    }
    const signed = /^\/api\/v1\/files\/([\w-]+)\/signed-url$/.exec(url.pathname);
    if (signed) {
      if (!files.has(signed[1]!)) return json(404, { error: { code: 'FILE_NOT_FOUND', message: 'no file' } });
      return json(200, { fileId: signed[1], url: `${base}/api/v1/files/${signed[1]}/download`, expiresAt: '', expiresIn: 300 });
    }
    const file = /^\/api\/v1\/files\/([\w-]+)$/.exec(url.pathname);
    if (file && req.method === 'DELETE') {
      files.delete(file[1]!);
      return json(200, { success: true });
    }
    if (file && req.method === 'GET') {
      const f = files.get(file[1]!);
      if (!f) return json(404, { error: { code: 'FILE_NOT_FOUND', message: 'no file' } });
      return json(200, { id: file[1], url: '', originalName: 'x', fileType: f.type, sizeBytes: f.bytes.length, context: '', tags: {}, metadata: null, processingStatus: 'completed', workspaceId: null, createdAt: new Date().toISOString() });
    }
    json(404, { error: { code: 'NOT_FOUND', message: 'no route' } });
  });
  const port = await listen(server);
  base = `http://127.0.0.1:${port}`;
  return { url: base, stop: () => new Promise((r) => server.close(() => r())) };
}

/** An SMTP server with TLS and a login, keeping what it receives. */
async function startSmtp() {
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048 });
  const messages: SinkMessage[] = [];
  const state = { delayMs: 0, reject: new Set<string>() };
  const server = new SMTPServer({
    secure: true,
    key: pems.private,
    cert: pems.cert,
    logger: false,
    onAuth: (auth, _s, cb) => (auth.username === SMTP_USER && auth.password === SMTP_PASSWORD ? cb(null, { user: auth.username }) : cb(new Error('Invalid login'))),
    onRcptTo: (address, _s, cb) => {
      if (state.reject.has(address.address.toLowerCase())) {
        const err = Object.assign(new Error('Mailbox unavailable'), { responseCode: 550 });
        return cb(err);
      }
      cb();
    },
    onData: (stream, session, cb) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        setTimeout(() => {
          messages.push({ to: session.envelope.rcptTo.map((r) => r.address.toLowerCase()), raw: Buffer.concat(chunks).toString('utf8'), at: Date.now() });
          cb();
        }, state.delayMs);
      });
    },
  });
  const port = await listen(server.server);
  return { port, messages, state, stop: () => new Promise<void>((r) => server.close(() => r())) };
}

function serviceEnv(databaseUrl: string, storageUrl: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    PORT: String(PORTS.service),
    DASHBOARD_SERVICE_TOKEN: DASHBOARD_TOKEN,
    MAIL_SECRETS_KEY: '5a'.repeat(32),
    MAIL_UNSUBSCRIBE_KEY: '5b'.repeat(32),
    MAIL_ERASURE_WEBHOOK_SECRET: '5c'.repeat(32),
    PUBLIC_BASE_URL: SERVICE_URL.replace('127.0.0.1', 'localhost'),
    STORAGE_BRAIN_API_KEY: STORAGE_KEY,
    STORAGE_BRAIN_URL: storageUrl,
    WEBHOOK_ALLOW_INSECURE_TARGETS: 'true',
    // The SMTP sink presents a self-signed certificate.
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    GIT_SHA: 'e2e',
  };
}

const MAIN = path.join(REPO, 'apps/service/dist/main.js');

function run(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd: path.join(REPO, 'apps/service'), stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`service ${args.join(' ')} exited ${code}`))));
  });
}

async function waitHealthy(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${SERVICE_URL}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the mail service did not become healthy');
}

export async function startStack() {
  const [pg, storage, smtp] = await Promise.all([startPostgres(), startStorage(), startSmtp()]);
  const env = serviceEnv(pg.url, storage.url);
  await run(['migrate'], env);

  let service: ChildProcess | null = null;
  const startService = async () => {
    service = spawn(process.execPath, [MAIN, 'serve'], { env, cwd: path.join(REPO, 'apps/service'), stdio: ['ignore', 'inherit', 'inherit'] });
    await waitHealthy();
  };
  const stopService = (signal: NodeJS.Signals) =>
    new Promise<void>((resolve) => {
      const s = service;
      if (!s || s.exitCode !== null) return resolve();
      s.once('exit', () => resolve());
      s.kill(signal);
    });
  await startService();

  const control = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const body = req.method === 'POST' ? JSON.parse((await read(req)).toString() || '{}') : {};
    const reply = (value: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/smtp/messages') return reply({ port: smtp.port, messages: smtp.messages });
    if (url.pathname === '/smtp/configure') {
      smtp.state.delayMs = Number(body.delayMs ?? 0);
      smtp.state.reject = new Set(((body.reject as string[]) ?? []).map((a) => a.toLowerCase()));
      return reply({ ok: true });
    }
    if (url.pathname === '/service/restart') {
      await stopService((body.signal as NodeJS.Signals) ?? 'SIGKILL');
      await startService();
      return reply({ ok: true });
    }
    res.writeHead(404);
    res.end();
  });
  await listen(control, PORTS.control);

  return {
    smtpPort: smtp.port,
    stop: async () => {
      await new Promise<void>((r) => control.close(() => r()));
      await stopService('SIGTERM');
      await Promise.all([smtp.stop(), storage.stop()]);
      await pg.stop();
    },
  };
}
