import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStripeMock } from '../support/stripe-mock.js';

/**
 * scripts/stripe-setup.mjs, run exactly the way the secrets proxy runs it
 * (`node --input-type=module -` with the file on stdin and a capture
 * directory): against stripe-mock, which proves every request it sends is one
 * Stripe accepts, and against a stateful fake, which proves a re-run creates
 * nothing and the captures hold the right ids.
 */

const SCRIPT = readFileSync(new URL('../../scripts/stripe-setup.mjs', import.meta.url), 'utf8');
const testKey = () => `sk_test_${randomBytes(12).toString('hex')}`;

type Run = { code: number | null; stdout: string; stderr: string; captures: Record<string, string> };

function runSetup(apiBase: string, options: { key?: string; args?: string[]; captureDir?: string | null } = {}): Promise<Run> {
  const dir = options.captureDir === null ? null : (options.captureDir ?? mkdtempSync(join(tmpdir(), 'stripe-setup-')));
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', STRIPE_API_BASE: apiBase, STRIPE_SECRET_KEY: options.key ?? testKey() };
  if (dir) env.SECRETS_CAPTURE_DIR = dir;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-', ...(options.args ?? [])], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      const captures: Record<string, string> = {};
      if (dir) for (const f of readdirSync(dir)) captures[f] = readFileSync(join(dir, f), 'utf8');
      if (dir && options.captureDir === undefined) rmSync(dir, { recursive: true, force: true });
      resolve({ code, stdout, stderr, captures });
    });
    child.stdin.end(SCRIPT);
  });
}

describe('stripe-setup.mjs against stripe-mock', () => {
  let mock: Awaited<ReturnType<typeof startStripeMock>>;
  beforeAll(async () => {
    mock = await startStripeMock();
  }, 120_000);
  afterAll(() => mock?.stop());

  it('every request is one Stripe accepts; the ids land in the captures', async () => {
    const run = await runSetup(`${mock.base}/v1`);
    // stripe-mock validates each request against Stripe's API description and
    // answers with fixtures; its webhook-endpoint fixture carries no real
    // whsec_ secret, so the script's last guard stops there, after every
    // request (catalogue, portal, endpoint) was accepted. The secret's path is
    // proven against the stateful fake below.
    expect(run.stderr).not.toMatch(/: (?!endpoint we_)/);
    expect(run.stderr).toMatch(/endpoint we_\w+ was created but no whsec_ secret came back/);
    expect(run.code).toBe(1);
    expect(run.captures.STRIPE_PRICE_STARTER_ID).toMatch(/^price_/);
    expect(run.captures.STRIPE_PRICE_GROWTH_ID).toMatch(/^price_/);
    expect(run.captures.STRIPE_PORTAL_CONFIGURATION_ID).toMatch(/^bpc_/);
    expect(run.stdout).toContain('portal configuration:');
  });
});

/** The slice of Stripe the script touches, with state and Idempotency-Key replay. */
function startFakeStripe() {
  const state = {
    products: [] as any[],
    prices: [] as any[],
    portals: [] as any[],
    endpoints: [] as any[],
    requests: [] as Array<{ method: string; path: string }>,
  };
  let seq = 0;
  const id = (p: string) => `${p}_${++seq}${randomBytes(4).toString('hex')}`;
  const replay = new Map<string, unknown>();
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://fake');
      const path = url.pathname.replace(/^\/v1/, '');
      const form = Object.fromEntries(new URLSearchParams(raw));
      const method = req.method!;
      state.requests.push({ method, path });
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const key = req.headers['idempotency-key'] as string | undefined;
      if (key && replay.has(key)) return send(200, replay.get(key));
      const done = (body: unknown) => {
        if (key) replay.set(key, body);
        send(200, body);
      };
      const meta = (f: Record<string, string>) =>
        Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));
      const list = (data: unknown[]) => send(200, { object: 'list', data, has_more: false });

      if (method === 'GET' && path === '/products') return list(state.products);
      if (method === 'POST' && path === '/products') {
        const p = { id: id('prod'), name: form.name, description: form.description, tax_code: form.tax_code, metadata: meta(form) };
        state.products.push(p);
        return done(p);
      }
      if (method === 'POST' && path.startsWith('/products/')) {
        const p = state.products.find((x) => x.id === path.split('/')[2]);
        Object.assign(p, form);
        return done(p);
      }
      if (method === 'GET' && path === '/prices') {
        const keys = url.searchParams.getAll('lookup_keys[]');
        return list(state.prices.filter((p) => keys.includes(p.lookup_key)));
      }
      if (method === 'POST' && path === '/prices') {
        const p = { id: id('price'), lookup_key: form.lookup_key, unit_amount: Number(form.unit_amount), currency: form.currency, recurring: { interval: form['recurring[interval]'] } };
        state.prices.push(p);
        return done(p);
      }
      if (method === 'GET' && path === '/billing_portal/configurations') return list(state.portals);
      if (method === 'POST' && path === '/billing_portal/configurations') {
        const c = { id: id('bpc'), metadata: meta(form), form };
        state.portals.push(c);
        return done(c);
      }
      if (method === 'POST' && path.startsWith('/billing_portal/configurations/')) {
        const c = state.portals.find((x) => x.id === path.split('/')[3]);
        c.form = form;
        return done(c);
      }
      if (method === 'GET' && path === '/webhook_endpoints') return list(state.endpoints);
      if (method === 'POST' && path === '/webhook_endpoints') {
        const e = { id: id('we'), url: form.url, metadata: meta(form), api_version: form.api_version, enabled_events: Object.entries(form).filter(([k]) => k.startsWith('enabled_events')).map(([, v]) => v) };
        state.endpoints.push(e);
        return done({ ...e, secret: `whsec_${randomBytes(16).toString('hex')}` });
      }
      if (method === 'POST' && path.startsWith('/webhook_endpoints/')) return done(state.endpoints.find((x) => x.id === path.split('/')[2]));
      if (method === 'DELETE' && path.startsWith('/webhook_endpoints/')) {
        state.endpoints = state.endpoints.filter((x) => x.id !== path.split('/')[2]);
        return send(200, { deleted: true });
      }
      send(404, { error: { message: `unrouted ${method} ${path}` } });
    });
  });
  return new Promise<{ base: string; state: typeof state; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ base: `http://127.0.0.1:${port}/v1`, state, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

describe('stripe-setup.mjs against a stateful fake', () => {
  let fake: Awaited<ReturnType<typeof startFakeStripe>>;
  beforeAll(async () => {
    fake = await startFakeStripe();
  });
  afterAll(() => fake?.close());

  it('creates the catalogue, the portal and the endpoint once; a re-run creates nothing and keeps the ids; --recreate rotates the secret', async () => {
    const first = await runSetup(fake.base);
    expect(first.code, first.stderr).toBe(0);
    expect(fake.state.products.map((p) => p.metadata.product)).toEqual(['mail', 'mail']);
    expect(fake.state.prices.map((p) => [p.lookup_key, p.unit_amount])).toEqual([
      ['mail-starter-monthly', 900],
      ['mail-growth-monthly', 2900],
    ]);
    expect(fake.state.portals[0].form['features[subscription_update][products][1][prices][0]']).toBe(first.captures.STRIPE_PRICE_GROWTH_ID);
    expect(fake.state.endpoints).toHaveLength(1);
    expect(fake.state.endpoints[0]).toMatchObject({ url: 'https://mail.lumitra.co/stripe/webhook', api_version: '2025-03-31.basil' });
    expect(fake.state.endpoints[0].enabled_events).toContain('invoice.payment_failed');
    expect(first.captures.STRIPE_WEBHOOK_SECRET).toMatch(/^whsec_/);

    const second = await runSetup(fake.base);
    expect(second.code, second.stderr).toBe(0);
    expect(fake.state.products).toHaveLength(2);
    expect(fake.state.prices).toHaveLength(2);
    expect(fake.state.portals).toHaveLength(1);
    expect(fake.state.endpoints).toHaveLength(1);
    for (const k of ['STRIPE_PRICE_STARTER_ID', 'STRIPE_PRICE_GROWTH_ID', 'STRIPE_PORTAL_CONFIGURATION_ID']) expect(second.captures[k]).toBe(first.captures[k]);
    // The secret cannot be read back: none is captured, Infisical keeps the first.
    expect(second.captures.STRIPE_WEBHOOK_SECRET).toBeUndefined();

    const third = await runSetup(fake.base, { args: ['--recreate'] });
    expect(third.code, third.stderr).toBe(0);
    expect(fake.state.endpoints).toHaveLength(1);
    expect(third.captures.STRIPE_WEBHOOK_SECRET).toMatch(/^whsec_/);
    expect(third.captures.STRIPE_WEBHOOK_SECRET).not.toBe(first.captures.STRIPE_WEBHOOK_SECRET);
  });

  it('refuses before any request: a live key without --live, a placeholder, no capture directory, a wrong URL', async () => {
    const before = fake.state.requests.length;
    const live = await runSetup(fake.base, { key: `sk_live_${randomBytes(12).toString('hex')}` });
    expect(live.code).toBe(2);
    expect(live.stderr).toContain('LIVE key without --live');
    expect((await runSetup(fake.base, { key: 'PLACEHOLDER_REPLACE_ME' })).code).toBe(2);
    expect((await runSetup(fake.base, { captureDir: null })).code).toBe(2);
    expect((await runSetup(fake.base, { args: ['--webhook-url', 'http://mail.lumitra.co/hook'] })).code).toBe(2);
    expect((await runSetup(fake.base, { args: ['--live'] })).code).toBe(2);
    expect(fake.state.requests.length).toBe(before);
  });

  it('stops on a Price that exists with another amount instead of selling it', async () => {
    fake.state.prices[0].unit_amount = 1000;
    const run = await runSetup(fake.base);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('another amount');
    fake.state.prices[0].unit_amount = 900;
  });
});
