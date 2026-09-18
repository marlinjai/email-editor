import { vi } from 'vitest';
import { createMailClient, type MailClient, type MailClientOptions } from '../client';

/** A `Response` builder for the mocked `fetch`. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message = 'failed',
  details?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(status, { error: { code, message, details } }, headers);
}

export interface TestClient {
  client: MailClient;
  fetchMock: ReturnType<typeof vi.fn>;
}

/**
 * A client wired to a mocked `fetch` with instant, deterministic backoff (the
 * injected `__sleep` resolves immediately and `__random` is fixed at 0), so
 * retry tests run in milliseconds without fighting fake timers.
 */
export function createTestClient(overrides: Partial<MailClientOptions> = {}): TestClient {
  const fetchMock = vi.fn();
  const client = createMailClient({
    baseUrl: 'https://mail.test.internal',
    apiKey: 'ek_full_test_key',
    fetch: fetchMock as unknown as typeof fetch,
    maxRetries: 2,
    timeoutMs: 1000,
    __sleep: async () => {},
    __random: () => 0,
    ...overrides,
  });
  return { client, fetchMock };
}
