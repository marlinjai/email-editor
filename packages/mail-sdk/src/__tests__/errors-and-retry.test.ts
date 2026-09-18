import { describe, expect, it, vi } from 'vitest';
import { MailApiError, MailNetworkError, MailResponseValidationError, MailTimeoutError } from '../errors';
import { createTestClient, errorResponse, jsonResponse } from './test-helpers';

describe('error mapping', () => {
  it('parses the error envelope into a typed MailApiError', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(
      errorResponse(404, 'not_found', 'no such mailing', undefined, { 'x-request-id': 'req_1' }),
    );

    await expect(client.mailings.get('mlg_missing')).rejects.toMatchObject({
      name: 'MailApiError',
      code: 'not_found',
      status: 404,
      message: 'no such mailing',
      requestId: 'req_1',
    });
  });

  it('wraps an unparseable 5xx body as internal_error with the raw text in details', async () => {
    const { client, fetchMock } = createTestClient({ maxRetries: 0 });
    fetchMock.mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    );

    const err = await client.workspace.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailApiError);
    expect((err as MailApiError).code).toBe('internal_error');
    expect((err as MailApiError).details?.raw).toContain('502 Bad Gateway');
  });

  it('never retries a validation_failed (400)', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(errorResponse(400, 'validation_failed', 'bad body'));

    await expect(client.workspace.get()).rejects.toMatchObject({ code: 'validation_failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries daily_budget_exhausted, even though it is a 429', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(errorResponse(429, 'daily_budget_exhausted', 'budget spent'));

    await expect(client.mailings.send('mlg_1')).rejects.toMatchObject({ code: 'daily_budget_exhausted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries rate_limited (a RETRYABLE_ERRORS code) and then succeeds', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock
      .mockResolvedValueOnce(errorResponse(429, 'rate_limited', 'slow down'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await client.request('members.remove', { params: { id: 'mbr_1' } });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After (seconds) before retrying', async () => {
    const { fetchMock } = createTestClient();
    const sleepSpy = vi.fn(async () => {});
    // Rebuild with a spy in place of the no-op sleep so we can assert the delay.
    const { createMailClient } = await import('../client');
    const spiedClient = createMailClient({
      baseUrl: 'https://mail.test.internal',
      apiKey: 'ek_full_test',
      fetch: fetchMock as unknown as typeof fetch,
      maxRetries: 2,
      __sleep: sleepSpy,
      __random: () => 0,
    });
    fetchMock
      .mockResolvedValueOnce(errorResponse(429, 'rate_limited', 'slow down', undefined, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await spiedClient.request('members.remove', { params: { id: 'mbr_1' } });
    expect(sleepSpy).toHaveBeenCalledWith(2000, undefined);
  });

  it('exhausts retries and throws the last error', async () => {
    const { client, fetchMock } = createTestClient({ maxRetries: 2 });
    fetchMock.mockImplementation(async () => errorResponse(503, 'service_unavailable', 'down'));

    await expect(client.workspace.get()).rejects.toMatchObject({ code: 'service_unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('retries a network failure and surfaces MailNetworkError only after exhausting retries', async () => {
    const { client, fetchMock } = createTestClient({ maxRetries: 1 });
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const err = await client.workspace.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the same Idempotency-Key across every retry of one call', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock
      .mockResolvedValueOnce(errorResponse(500, 'internal_error', 'oops'))
      .mockResolvedValueOnce(jsonResponse(201, { key: 'x'.repeat(32), api_key: fakeApiKey() }));

    await client.apiKeys.create({ name: 'ŌPUNTIA admin' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    const secondHeaders = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers);
    const key1 = firstHeaders.get('idempotency-key');
    const key2 = secondHeaders.get('idempotency-key');
    expect(key1).toBeTruthy();
    expect(key1).toBe(key2);
  });

  it('never sends an Idempotency-Key on a GET', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await client.mailings.get('mlg_1');
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.has('idempotency-key')).toBe(false);
  });

  it('sends an empty JSON body for bodiless actions like send/pause/cancel', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(202, {}));
    await client.mailings.send('mlg_1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body).toBe('{}');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('times out a hung request and reports MailTimeoutError', async () => {
    const { client, fetchMock } = createTestClient({ timeoutMs: 5, maxRetries: 0 });
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const err = await client.workspace.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailTimeoutError);
  });

  it('does not treat a caller-initiated abort as a timeout, and never retries it', async () => {
    const { client, fetchMock } = createTestClient({ maxRetries: 2 });
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = client.workspace.get({ signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws MailResponseValidationError on a 2xx body that fails the contract schema, and never retries it', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { not: 'a workspace' }));

    const err = await client.workspace.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailResponseValidationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function fakeApiKey() {
  return {
    id: 'key_1',
    name: 'ŌPUNTIA admin',
    prefix: 'ek_full_ab',
    scope: 'full' as const,
    last_used_at: null,
    revoked_at: null,
    created_at: '2026-09-18T12:00:00.000Z',
  };
}
