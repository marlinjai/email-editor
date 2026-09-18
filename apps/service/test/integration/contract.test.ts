import { foundationRoutes, matchRoute, routes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';

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
    const offline = appOver(h.sql, { providerFetch: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
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
