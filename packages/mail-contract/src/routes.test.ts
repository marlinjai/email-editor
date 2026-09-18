import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  type RouteBody,
  type RouteDef,
  type RouteResponse,
  acceptsIdempotencyKey,
  billingRoutes,
  buildPath,
  foundationRoutes,
  matchRoute,
  platformRoutes,
  routes,
  sendingRoutes,
  templateRoutes,
} from './routes';
import type { Mailing, RecipientBatch } from './mailings';

const all = Object.entries(routes) as [string, RouteDef][];

describe('route table', () => {
  it('has no duplicate method and path', () => {
    const seen = new Set<string>();
    for (const [id, r] of all) {
      const key = `${r.method} ${r.path}`;
      expect(seen.has(key), `${id} duplicates ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('keeps each phase in its own namespace', () => {
    const phases: [Record<string, RouteDef>, string][] = [
      [foundationRoutes, 'S0'],
      [templateRoutes, 'S1'],
      [sendingRoutes, 'S2'],
      [platformRoutes, 'S4'],
      [billingRoutes, 'S5'],
    ];
    for (const [ns, phase] of phases) for (const r of Object.values(ns)) expect(r.phase).toBe(phase);
    const total = phases.reduce((n, [ns]) => n + Object.keys(ns).length, 0);
    expect(Object.keys(routes).length).toBe(total);
  });

  it('declares params exactly when the path has :segments', () => {
    for (const [id, r] of all) {
      const names = [...r.path.matchAll(/:([a-z_]+)/g)].map((m) => m[1]).sort();
      if (names.length === 0) {
        expect(r.params, id).toBeUndefined();
      } else {
        expect(r.params, id).toBeDefined();
        const shape = (r.params as unknown as { shape: Record<string, unknown> }).shape;
        expect(Object.keys(shape).sort(), id).toEqual(names);
      }
    }
  });

  it('never gives a GET a body, and never gives a route both json and multipart', () => {
    for (const [id, r] of all) {
      if (r.method === 'GET') expect(r.body, id).toBeUndefined();
      expect(r.body !== undefined && r.multipart !== undefined, id).toBe(false);
    }
  });

  it('covers the operations the client plan calls', () => {
    for (const id of [
      'contacts.upsert',
      'contacts.erase',
      'contacts.messages',
      'templates.compile',
      'compile',
      'assets.upload',
      'mailings.create',
      'mailings.addRecipients',
      'mailings.test',
      'mailings.send',
      'mailings.pause',
      'mailings.resume',
      'mailings.cancel',
      'mailings.retryFailed',
      'mailings.duplicate',
      'mailings.get',
      'suppressions.create',
      'suppressions.delete',
      'topics.list',
      'webhooks.create',
    ]) {
      expect(routes, id).toHaveProperty([id]);
    }
  });

  it('only workspace creation and listing are dashboard-only', () => {
    expect(all.filter(([, r]) => r.access === 'dashboard').map(([id]) => id).sort()).toEqual(['workspaces.create', 'workspaces.list']);
  });

  it('only signup submission is public', () => {
    expect(all.filter(([, r]) => r.access === 'public').map(([id]) => id)).toEqual(['signupForms.submit']);
  });

  it('infers request and response types from the table', () => {
    expectTypeOf<RouteBody<'mailings.addRecipients'>>().toEqualTypeOf<RecipientBatch>();
    expectTypeOf<RouteResponse<'mailings.get'>>().toEqualTypeOf<Mailing>();
    expectTypeOf<RouteBody<'mailings.get'>>().toEqualTypeOf<undefined>();
  });
});

describe('idempotency', () => {
  it('every mutating route accepts a key, reads do not', () => {
    expect(acceptsIdempotencyKey(routes['mailings.send'])).toBe(true);
    expect(acceptsIdempotencyKey(routes['contacts.erase'])).toBe(true);
    expect(acceptsIdempotencyKey(routes['mailings.get'])).toBe(false);
  });
});

describe('buildPath and matchRoute', () => {
  it('fills and encodes params', () => {
    expect(buildPath('/v1/mailings/:id/send', { id: 'mlg 1/x' })).toBe('/v1/mailings/mlg%201%2Fx/send');
    expect(buildPath('/v1/webhooks/:id/deliveries/:delivery_id/redeliver', { id: 'w', delivery_id: 'd' })).toBe(
      '/v1/webhooks/w/deliveries/d/redeliver',
    );
  });

  it('refuses a missing or empty param', () => {
    expect(() => buildPath('/v1/mailings/:id', {})).toThrow(/id/);
    expect(() => buildPath('/v1/mailings/:id', { id: '' })).toThrow(/id/);
  });

  it('round-trips every route', () => {
    for (const [id, r] of all) {
      const names = [...r.path.matchAll(/:([a-z_]+)/g)].map((m) => m[1]!);
      const params = Object.fromEntries(names.map((n) => [n, `${n}_1`]));
      const m = matchRoute(r.method, buildPath(r.path, params));
      expect(m?.id, id).toBe(id);
      expect(m?.params, id).toEqual(params);
    }
  });

  it('does not confuse a sub-resource with its parent, and misses unknown paths', () => {
    expect(matchRoute('POST', '/v1/mailings/m1/recipients')?.id).toBe('mailings.addRecipients');
    expect(matchRoute('POST', '/v1/mailings/m1/recipients/segment')?.id).toBe('mailings.addSegment');
    expect(matchRoute('GET', '/v1/nope')).toBeNull();
    expect(matchRoute('DELETE', '/v1/mailings/m1')).toBeNull();
  });
});
