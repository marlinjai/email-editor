import { foundationRoutes, matchRoute, routes, templateRoutes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '../../src/events.js';
import { brokenSpacerDocument, helloDocument } from '../support/documents.js';
import { startHarness, type Harness } from '../support/harness.js';
import { pngBytes } from '../support/images.js';
import { ImageServer } from '../support/image-server.js';

/**
 * The service answers every S0 operation of `@marlinjai/mail-contract` with a
 * body its response schema accepts, at the status the table promises, and every
 * error with the contract's envelope. The SDK and the dashboard are written
 * against those schemas, so a drift here would break them, not this service.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('contract');
});
afterAll(() => h?.drop());

function conforms(id: OperationId, res: { status: number; body: unknown }) {
  expect(res.status, `${id}: ${JSON.stringify(res.body)}`).toBe(routes[id].status);
  const parsed = routes[id].response.safeParse(res.body);
  expect(parsed.success, `${id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
}

describe('contract conformance, phase S0', () => {
  it('every S0 operation answers with its declared status and response schema', async () => {
    const owner = { subject: W.owner, workspace: W.id };
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };

    await run('workspaces.create', await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'conformer', body: { slug: 'conform', name: 'C', owner: { email: 'c@c.io', name: null } } }));
    await run('workspaces.list', await h.call({ path: '/v1/workspaces', subject: W.owner }));
    await run('workspace.get', await h.call({ path: '/v1/workspace', key: W.key }));
    await run('workspace.update', await h.call({ method: 'PATCH', path: '/v1/workspace', ...owner, body: { name: 'Renamed' } }));
    const added = await run('members.add', await h.call({ method: 'POST', path: '/v1/members', ...owner, body: { subject: 'm1', email: 'm1@c.io', role: 'viewer' } }));
    await run('members.list', await h.call({ path: '/v1/members', key: W.key }));
    await run('members.update', await h.call({ method: 'PATCH', path: `/v1/members/${added.body.id}`, ...owner, body: { role: 'editor' } }));
    await run('members.remove', await h.call({ method: 'DELETE', path: `/v1/members/${added.body.id}`, ...owner }));
    const key = await run('apiKeys.create', await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'conform' } }));
    await run('apiKeys.list', await h.call({ path: '/v1/api-keys', key: W.key }));
    await run('apiKeys.revoke', await h.call({ method: 'DELETE', path: `/v1/api-keys/${key.body.api_key.id}`, key: W.key }));
    await run('audit.list', await h.call({ path: '/v1/audit-log', key: W.key }));

    expect([...covered].sort()).toEqual(Object.keys(foundationRoutes).sort());
  });

  it('every S0 route of the table is mounted at its method and path', async () => {
    for (const [id, def] of Object.entries(foundationRoutes)) {
      const path = def.path.replace(':id', '00000000-0000-4000-8000-000000000000');
      expect(matchRoute(def.method, path)?.id).toBe(id);
      const res = await h.call({ method: def.method, path, key: W.key, body: def.method === 'GET' ? undefined : {} });
      // Whatever the answer (403, 404, 400), it must be the route answering, not
      // the catch-all "No route for".
      expect(String(res.body.error?.message ?? ''), `${id}`).not.toMatch(/^No route for/);
    }
  });

  it('errors use the contract envelope with a known code', async () => {
    const { ErrorBody } = await import('@marlinjai/mail-contract');
    for (const res of [
      await h.call({ path: '/v1/workspace' }),
      await h.call({ path: '/v1/nope', key: W.key }),
      await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: '' } }),
      await h.call({ method: 'DELETE', path: '/v1/members/00000000-0000-4000-8000-000000000000', subject: W.owner, workspace: W.id }),
    ]) {
      expect(ErrorBody.safeParse(res.body).success, JSON.stringify(res.body)).toBe(true);
    }
  });
});

describe('contract conformance, phase S1', () => {
  it('every S1 operation answers with its declared status and response schema', async () => {
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };

    const created = await run('templates.create', await h.call({ method: 'POST', path: '/v1/templates', key: W.key, body: { name: 'Conform', description: 'd', document: helloDocument() } }));
    const id = created.body.id;
    await run('templates.list', await h.call({ path: '/v1/templates', key: W.key }));
    await run('templates.get', await h.call({ path: `/v1/templates/${id}`, key: W.key }));
    await run('templates.update', await h.call({ method: 'PUT', path: `/v1/templates/${id}`, key: W.key, body: { base_version: 1, document: helloDocument('v2'), description: null } }));
    await run('templates.versions', await h.call({ path: `/v1/templates/${id}/versions`, key: W.key }));
    await run('templates.version', await h.call({ path: `/v1/templates/${id}/versions/1`, key: W.key }));
    await run('templates.compile', await h.call({ method: 'POST', path: `/v1/templates/${id}/compile`, key: W.key, body: { version: 1 } }));
    const withErrors = await run('compile', await h.call({ method: 'POST', path: '/v1/compile', key: W.key, body: { document: brokenSpacerDocument() } }));
    expect(withErrors.body.errors.length).toBeGreaterThan(0);
    const upload = new FormData();
    upload.append('file', new Blob([pngBytes(2, 2)], { type: 'image/png' }), 'c.png');
    const asset = await run('assets.upload', await h.call({ method: 'POST', path: '/v1/assets', key: W.key, form: upload }));
    await run('assets.get', await h.call({ path: `/v1/assets/${asset.body.id}`, key: W.key }));
    // The import fetches from a local server, which only an open SSRF policy reaches.
    const images = await ImageServer.start();
    const open = await startHarness({ webhookUrlPolicy: { allowInsecureHttp: true, allowPrivateTargets: true } });
    try {
      images.on('/c.png', { body: pngBytes(2, 2) });
      const O = await open.seedWorkspace('contract-import');
      await run('assets.import', await open.call({ method: 'POST', path: '/v1/assets/import', key: O.key, body: { url: images.url('/c.png') } }));
    } finally {
      await images.stop();
      await open.drop();
    }
    await run('templates.delete', await h.call({ method: 'DELETE', path: `/v1/templates/${id}`, key: W.key }));

    expect([...covered].sort()).toEqual(Object.keys(templateRoutes).sort());
  });

  it('every S1 route of the table is mounted at its method and path', async () => {
    for (const [id, def] of Object.entries(templateRoutes)) {
      const path = def.path.replace(':id', '00000000-0000-4000-8000-000000000000').replace(':version', '1');
      expect(matchRoute(def.method, path)?.id).toBe(id);
      const res = await h.call({ method: def.method, path, key: W.key, body: def.method === 'GET' ? undefined : {} });
      expect(String(res.body.error?.message ?? ''), `${id}`).not.toMatch(/^No route for/);
    }
  });
});

// Team F1 of S2: providers, topics, contacts and suppressions. Its own block, so
// the four S2 teams each append theirs without touching another's.
describe('contract conformance, S2 providers, topics, contacts and suppressions', () => {
  const F1_ROUTES = Object.keys(routes).filter((id) => /^(providers|topics|contacts|suppressions)\./.test(id)) as OperationId[];

  it('every F1 operation answers with its declared status and response schema', async () => {
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };
    const key = W.key;
    const provider = await run('providers.create', await h.call({
      method: 'POST',
      path: '/v1/providers',
      key,
      body: {
        kind: 'resend',
        name: 'Conform',
        config: { api_key: 're_conformance' },
        from_name: 'C',
        from_email: 'c@example.com',
        reply_to: 'reply@example.com',
        policy: { daily_recipient_budget: 100, min_interval_ms: 0, max_recipients_per_message: 1 },
      },
    }));
    await run('providers.list', await h.call({ path: '/v1/providers', key }));
    await run('providers.get', await h.call({ path: `/v1/providers/${provider.body.id}`, key }));
    await run('providers.update', await h.call({ method: 'PATCH', path: `/v1/providers/${provider.body.id}`, key, body: { kind: 'resend', name: 'Renamed' } }));
    await run('providers.usage', await h.call({ path: `/v1/providers/${provider.body.id}/usage`, key }));
    const { appOver } = await import('../support/app-call.js');
    const offline = appOver(h, { providerFetch: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    await run('providers.verify', await offline.call({ method: 'POST', path: `/v1/providers/${provider.body.id}/verify`, key }));
    await run('providers.delete', await h.call({ method: 'DELETE', path: `/v1/providers/${provider.body.id}`, key }));

    const topic = await run('topics.create', await h.call({ method: 'POST', path: '/v1/topics', key, body: { slug: 'conform', name: 'Conform' } }));
    await run('topics.list', await h.call({ path: '/v1/topics', key }));
    await run('topics.update', await h.call({ method: 'PATCH', path: `/v1/topics/${topic.body.id}`, key, body: { description: 'd' } }));

    const contact = await run('contacts.upsert', await h.call({
      method: 'POST',
      path: '/v1/contacts',
      key,
      body: { email: 'person@example.com', external_id: 'p-1', locale: 'de', properties: { a: 1 }, topics: ['conform'] },
    }));
    await run('contacts.list', await h.call({ path: '/v1/contacts?topic=conform', key }));
    await run('contacts.get', await h.call({ path: `/v1/contacts/${contact.body.contact.id}`, key }));
    await run('contacts.messages', await h.call({ path: `/v1/contacts/${contact.body.contact.id}/messages`, key }));

    const block = await run('suppressions.create', await h.call({ method: 'POST', path: '/v1/suppressions', key, body: { email: 'person@example.com', reason: 'unsubscribed', topic: 'conform' } }));
    await run('suppressions.list', await h.call({ path: '/v1/suppressions', key }));
    await run('contacts.erase', await h.call({ method: 'DELETE', path: `/v1/contacts/${contact.body.contact.id}`, key }));
    await run('suppressions.delete', await h.call({ method: 'DELETE', path: `/v1/suppressions/${block.body.id}`, key }));

    expect([...covered].sort()).toEqual([...F1_ROUTES].sort());
  });

  it('every F1 route of the table is mounted at its method and path', async () => {
    for (const id of F1_ROUTES) {
      const def = routes[id];
      const path = def.path.replace(':id', '00000000-0000-4000-8000-000000000000');
      expect(matchRoute(def.method, path)?.id).toBe(id);
      const res = await h.call({ method: def.method, path, key: W.key, body: def.method === 'GET' ? undefined : {} });
      expect(String(res.body.error?.message ?? ''), id).not.toMatch(/^No route for/);
    }
  });
});

/**
 * S2's webhooks.* operations (F4). The other S2 resources (providers, contacts,
 * mailings, the unsubscribe page) are conformance-tested by the teams that own
 * them; this covers only what this branch mounts.
 */
describe('contract conformance, phase S2 webhooks', () => {
  it('every webhooks.* operation answers with its declared status and response schema', async () => {
    const wh = await startHarness();
    const w = await wh.seedWorkspace('contract-webhooks');
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };


    const created = await run(
      'webhooks.create',
      await wh.call({
        method: 'POST',
        path: '/v1/webhooks',
        key: w.key,
        body: { url: 'https://example.com/hook', events: ['contact.unsubscribed'] },
      }),
    );
    const endpointId = created.body.endpoint.id;
    await run('webhooks.list', await wh.call({ path: '/v1/webhooks', key: w.key }));
    await run('webhooks.get', await wh.call({ path: `/v1/webhooks/${endpointId}`, key: w.key }));
    await run('webhooks.update', await wh.call({ method: 'PATCH', path: `/v1/webhooks/${endpointId}`, key: w.key, body: { enabled: false } }));
    await run('webhooks.rotateSecret', await wh.call({ method: 'POST', path: `/v1/webhooks/${endpointId}/rotate-secret`, key: w.key }));
    await run('webhooks.deliveries', await wh.call({ path: `/v1/webhooks/${endpointId}/deliveries`, key: w.key }));

    await wh.call({ method: 'PATCH', path: `/v1/webhooks/${endpointId}`, key: w.key, body: { enabled: true } });
    await wh.sql.begin((tx) =>
      emitEvent(tx, w.id, {
        type: 'contact.unsubscribed',
        data: {
          contact_id: null,
          external_id: null,
          email: 'conformer@example.com',
          topic: null,
          mailing_id: null,
          source: 'api',
          unsubscribed_at: new Date().toISOString(),
        },
      }),
    );
    const [delivery] = await wh.sql<{ id: string }[]>`SELECT id FROM webhook_deliveries WHERE endpoint_id = ${endpointId}`;
    await run('webhooks.redeliver', await wh.call({ method: 'POST', path: `/v1/webhooks/${endpointId}/deliveries/${delivery!.id}/redeliver`, key: w.key }));

    await run('webhooks.delete', await wh.call({ method: 'DELETE', path: `/v1/webhooks/${endpointId}`, key: w.key }));

    const webhookOps = Object.keys(routes).filter((id) => id.startsWith('webhooks.')) as OperationId[];
    expect([...covered].sort()).toEqual(webhookOps.sort());
    await wh.drop();
  });
});

// S5: billing. Status and schema of every billing operation are asserted in
// test/integration/billing.test.ts (it needs a Stripe stand-in); here, that
// every billing route of the table is mounted at its method and path.
describe('contract conformance, S5 billing routes are mounted', () => {
  it('every billing route of the table answers from its handler, not the catch-all', async () => {
    const { billingRoutes } = await import('@marlinjai/mail-contract');
    for (const [id, def] of Object.entries(billingRoutes)) {
      expect(matchRoute(def.method, def.path)?.id).toBe(id);
      const res = await h.call({ method: def.method, path: def.path, key: W.key, body: def.method === 'GET' ? undefined : {} });
      expect(String(res.body.error?.message ?? ''), `${id}`).not.toMatch(/^No route for/);
    }
  });
});
