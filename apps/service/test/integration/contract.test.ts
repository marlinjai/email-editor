import { foundationRoutes, matchRoute, routes, templateRoutes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brokenSpacerDocument, helloDocument } from '../support/documents.js';
import { startHarness, type Harness } from '../support/harness.js';
import { pngBytes } from '../support/images.js';

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
