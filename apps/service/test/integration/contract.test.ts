import { foundationRoutes, matchRoute, routes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '../../src/events.js';
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
