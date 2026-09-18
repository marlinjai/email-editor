import {
  ContactPropertyParams,
  IdParams,
  TemplateVersionParams,
  WebhookDeliveryParams,
  buildPath,
  routes,
  type OperationId,
  type RouteDef,
} from '@marlinjai/mail-contract';
import { describe, expect, it, vi } from 'vitest';
import { createMailClient } from '../client';
import { jsonResponse } from './test-helpers';

/**
 * Every operation in the route table round-trips through `client.request` and
 * has a namespaced method. This is the test the advisor asked for: a new route
 * added to `@marlinjai/mail-contract` with no matching change here fails the
 * build, instead of silently missing from the SDK.
 */

const MULTIPART_OPS = new Set<OperationId>(['assets.upload', 'imports.create']);

// Ids that live under a namespace whose name does not match the operation id's
// prefix, or that are exposed as a top-level function instead of a namespace.
const NAMESPACE_OVERRIDES: Partial<Record<OperationId, readonly [string | null, string]>> = {
  'audit.list': ['auditLog', 'list'],
  compile: [null, 'compile'],
};

function resolveMethod(client: unknown, operationId: OperationId): unknown {
  const override = NAMESPACE_OVERRIDES[operationId];
  const c = client as Record<string, unknown>;
  if (override) {
    const [ns, method] = override;
    return ns === null ? c[method] : (c[ns] as Record<string, unknown> | undefined)?.[method];
  }
  const [ns, method] = operationId.split('.') as [string, string];
  return (c[ns] as Record<string, unknown> | undefined)?.[method];
}

function sampleParams(operationId: OperationId): Record<string, string | number> | undefined {
  const route = routes[operationId] as RouteDef;
  if (!route.params) return undefined;
  if (route.params === IdParams) return { id: 'id_1' };
  if (route.params === TemplateVersionParams) return { id: 'id_1', version: 1 };
  if (route.params === WebhookDeliveryParams) return { id: 'id_1', delivery_id: 'del_1' };
  if (route.params === ContactPropertyParams) return { key: 'city' };
  throw new Error(`"${operationId}" uses an unrecognised params schema; teach sampleParams() its shape`);
}

describe('the route table', () => {
  const operationIds = Object.keys(routes) as OperationId[];

  it('is non-empty (guards against an accidental empty import)', () => {
    expect(operationIds.length).toBeGreaterThan(50);
  });

  it.each(operationIds)('"%s" has a namespaced SDK method', (operationId) => {
    const client = createMailClient({ baseUrl: 'https://mail.test.internal', apiKey: 'ek_full_test' });
    const fn = resolveMethod(client, operationId);
    expect(fn, `no SDK method resolves for operation "${operationId}"`).toBeTypeOf('function');
  });

  it.each(operationIds.filter((id) => !MULTIPART_OPS.has(id)))('"%s" round-trips through client.request', async (operationId) => {
    const route = routes[operationId] as RouteDef;
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => jsonResponse(route.status, {}));
    const client = createMailClient({
      baseUrl: 'https://mail.test.internal',
      apiKey: 'ek_full_test',
      fetch: fetchMock as unknown as typeof fetch,
      validateResponses: false,
    });

    const params = sampleParams(operationId);
    const body = route.body ? {} : undefined;
    await client.request(operationId, { params, body } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    const expectedPath = buildPath(route.path, params ?? {});
    expect(String(calledUrl)).toBe(`https://mail.test.internal${expectedPath}`);
    expect((calledInit as RequestInit).method).toBe(route.method);
  });
});
