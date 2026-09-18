import { describe, expect, it } from 'vitest';
import { createTestClient, errorResponse, jsonResponse } from './test-helpers';
import { MailApiError, type ResponseMeta } from '../index';

const mailing = {
  id: '00000000-0000-4000-8000-000000000001',
};

describe('onResponse: the response headers a caller can read', () => {
  it('hands over the parsed usage warning, the request id and the raw headers on success', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true }, { 'x-request-id': 'req-9', 'x-mail-usage-warning': 'messages=8200/10000,contacts=500/500' }),
    );
    const seen: ResponseMeta[] = [];
    await client.mailings.send(mailing.id, { onResponse: (m) => seen.push(m) });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.status).toBe(200);
    expect(seen[0]!.requestId).toBe('req-9');
    expect(seen[0]!.headers.get('x-mail-usage-warning')).toBe('messages=8200/10000,contacts=500/500');
    expect(seen[0]!.usageWarnings).toEqual([
      { metric: 'messages', used: 8200, limit: 10000 },
      { metric: 'contacts', used: 500, limit: 500 },
    ]);
  });

  it('reports no warnings when the header is absent', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }));
    const seen: ResponseMeta[] = [];
    await client.request('topics.list', {}, { onResponse: (m) => seen.push(m) });
    expect(seen[0]!.usageWarnings).toEqual([]);
  });

  it('is not called when the call fails, even after retries', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock
      .mockResolvedValueOnce(errorResponse(503, 'service_unavailable'))
      .mockResolvedValueOnce(errorResponse(429, 'plan_limit_reached', 'The Free plan allows 500 contacts.', { metric: 'contacts', used: 500, limit: 500, plan: 'free' }));
    const seen: ResponseMeta[] = [];
    const err = await client.request('topics.list', {}, { onResponse: (m) => seen.push(m) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailApiError);
    expect((err as MailApiError).code).toBe('plan_limit_reached');
    expect((err as MailApiError).details).toMatchObject({ metric: 'contacts', used: 500, limit: 500 });
    expect(seen).toEqual([]);
  });

  it('is called for the one attempt that succeeded after a retry', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock
      .mockResolvedValueOnce(errorResponse(503, 'service_unavailable'))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }, { 'x-request-id': 'req-2' }));
    const seen: ResponseMeta[] = [];
    await client.request('topics.list', {}, { onResponse: (m) => seen.push(m) });
    expect(seen.map((m) => m.requestId)).toEqual(['req-2']);
  });
});
