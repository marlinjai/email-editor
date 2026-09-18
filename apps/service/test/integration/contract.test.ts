import { foundationRoutes, matchRoute, routes, templateRoutes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '../../src/events.js';
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

describe('contract conformance, phase S4: tags, properties, segments', () => {
  it('every tags, contactProperties and segments operation, and mailings.addSegment, conforms', async () => {
    const { seedSending, createMailing } = await import('../support/sending.js');
    const w = await h.seedWorkspace('conform-s4-segments');
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };
    const { provider } = await seedSending(h, w.id, { topic: 'news' });
    const person = await h.call({ method: 'POST', path: '/v1/contacts', key: w.key, body: { email: 'seg@conform.io', topics: ['news'] } });
    const contactId = person.body.contact.id as string;

    const tag = await run('tags.create', await h.call({ method: 'POST', path: '/v1/tags', key: w.key, body: { slug: 'vip', name: 'VIP' } }));
    await run('tags.list', await h.call({ path: '/v1/tags', key: w.key }));
    await run('tags.assign', await h.call({ method: 'POST', path: `/v1/tags/${tag.body.id}/contacts`, key: w.key, body: { contact_ids: [contactId] } }));

    const property = { key: 'plan', label: 'Plan', type: 'string' };
    await run('contactProperties.create', await h.call({ method: 'POST', path: '/v1/contact-properties', key: w.key, body: property }));
    await run('contactProperties.list', await h.call({ path: '/v1/contact-properties', key: w.key }));

    const filter = { field: 'tag', op: 'eq', value: 'vip' };
    await run('segments.preview', await h.call({ method: 'POST', path: '/v1/segments/preview', key: w.key, body: { filter } }));
    const seg = await run('segments.create', await h.call({ method: 'POST', path: '/v1/segments', key: w.key, body: { name: 'VIPs', filter } }));
    await run('segments.list', await h.call({ path: '/v1/segments', key: w.key }));
    await run('segments.get', await h.call({ path: `/v1/segments/${seg.body.id}`, key: w.key }));
    await run('segments.update', await h.call({ method: 'PUT', path: `/v1/segments/${seg.body.id}`, key: w.key, body: { name: 'VIP', filter } }));
    const mailing = await createMailing(h, w, { topic: 'news', provider_id: provider.id });
    const added = await run(
      'mailings.addSegment',
      await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/recipients/segment`, key: w.key, body: { segment_id: seg.body.id } }),
    );
    expect(added.body.added).toBe(1);

    await run('segments.delete', await h.call({ method: 'DELETE', path: `/v1/segments/${seg.body.id}`, key: w.key }));
    await run('contactProperties.delete', await h.call({ method: 'DELETE', path: '/v1/contact-properties/plan', key: w.key }));
    await run('tags.unassign', await h.call({ method: 'DELETE', path: `/v1/tags/${tag.body.id}/contacts`, key: w.key, body: { contact_ids: [contactId] } }));
    await run('tags.delete', await h.call({ method: 'DELETE', path: `/v1/tags/${tag.body.id}`, key: w.key }));

    const mine = (Object.keys(routes) as OperationId[]).filter(
      (id) => id.startsWith('tags.') || id.startsWith('contactProperties.') || id.startsWith('segments.') || id === 'mailings.addSegment',
    );
    expect([...covered].sort()).toEqual(mine.sort());
  });
});

describe('contract conformance, phase S4: scheduling, A/B tests and tracking', () => {
  it('every scheduling, A/B and tracking operation answers with its declared status and response schema', async () => {
    const { seedContact, seedSending, createMailing, addRecipients } = await import('../support/sending.js');
    const ops: OperationId[] = [
      'mailings.schedule',
      'mailings.unschedule',
      'mailings.setAbTest',
      'mailings.clearAbTest',
      'mailings.pickAbWinner',
      'mailings.analytics',
      'tracking.get',
      'tracking.update',
    ];
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };
    const S = await h.seedWorkspace('contract-s4-mailings');
    const s = await seedSending(h, S.id);
    const contact = await seedContact(h, S.id, s.topic.id, { email: 'conform@example.com' });
    const mailing = await createMailing(h, S, { topic: s.topic.slug, provider_id: s.provider.id });
    await addRecipients(h, S, mailing.id, [{ contact_id: contact.id }]);
    const at = new Date(Date.now() + 3_600_000).toISOString();

    await run('tracking.get', await h.call({ path: '/v1/workspace/tracking', key: S.key }));
    await run('tracking.update', await h.call({ method: 'PUT', path: '/v1/workspace/tracking', key: S.key, body: { opens: false, clicks: false } }));
    await run('mailings.schedule', await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/schedule`, key: S.key, body: { send_at: at } }));
    await run('mailings.unschedule', await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/unschedule`, key: S.key, body: {} }));
    const ab = { variants: [{ key: 'a', subject: 'A' }, { key: 'b', subject: 'B' }], test_fraction: 1, winner_metric: 'manual' };
    await run('mailings.setAbTest', await h.call({ method: 'PUT', path: `/v1/mailings/${mailing.id}/ab-test`, key: S.key, body: ab }));
    await run('mailings.clearAbTest', await h.call({ method: 'DELETE', path: `/v1/mailings/${mailing.id}/ab-test`, key: S.key }));
    await h.call({ method: 'PUT', path: `/v1/mailings/${mailing.id}/ab-test`, key: S.key, body: ab });
    expect((await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/send`, key: S.key, body: {} })).status).toBe(202);
    await run('mailings.pickAbWinner', await h.call({ method: 'POST', path: `/v1/mailings/${mailing.id}/ab-test/winner`, key: S.key, body: { variant: 'a' } }));
    await run('mailings.analytics', await h.call({ path: `/v1/mailings/${mailing.id}/analytics`, key: S.key }));

    expect([...covered].sort()).toEqual([...ops].sort());
  });
});

describe('contract conformance, phase S4: imports', () => {
  it('every imports.* operation answers with its declared status and response schema', async () => {
    const { createImportJob } = await import('../../src/imports/job.js');
    const { PlatformWorker } = await import('../../src/platform/worker.js');
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      conforms(id, res);
      covered.add(id);
      return res as { status: number; body: any };
    };
    const drain = () =>
      new PlatformWorker({ jobs: [createImportJob({ sql: h.sql, log: { error: () => {} } })], log: { error: () => {}, log: () => {} } }).drain();
    const form = new FormData();
    form.set('file', new File(['Email,Name\nconform@example.com,Con\nbad,Bad\n'], 'conform.csv', { type: 'text/csv' }));
    const created = await run('imports.create', await h.call({ method: 'POST', path: '/v1/imports', key: W.key, form }));
    const id = created.body.id;
    await run('imports.list', await h.call({ path: '/v1/imports', key: W.key }));
    const mapping = { mapping: { Email: 'email', Name: 'first_name' }, topics: [], tags: [], consent_confirmed: true };
    await run('imports.setMapping', await h.call({ method: 'PUT', path: `/v1/imports/${id}/mapping`, key: W.key, body: mapping }));
    await drain();
    await run('imports.get', await h.call({ path: `/v1/imports/${id}`, key: W.key }));
    await run('imports.rows', await h.call({ path: `/v1/imports/${id}/rows`, key: W.key }));
    await run('imports.commit', await h.call({ method: 'POST', path: `/v1/imports/${id}/commit`, key: W.key, body: { mapping_version: 1 } }));
    const second = new FormData();
    second.set('file', new File(['Email\nlater@example.com\n'], 'later.csv', { type: 'text/csv' }));
    const other = await h.call({ method: 'POST', path: '/v1/imports', key: W.key, form: second });
    await run('imports.cancel', await h.call({ method: 'POST', path: `/v1/imports/${other.body.id}/cancel`, key: W.key, body: {} }));
    await drain();
    const done = await h.call({ path: `/v1/imports/${id}`, key: W.key });
    expect(done.body.status).toBe('completed');

    const imports = Object.keys(routes).filter((k) => k.startsWith('imports.'));
    expect([...covered].sort()).toEqual(imports.sort());
  });
});
