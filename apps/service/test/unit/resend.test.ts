import { describe, expect, it } from 'vitest';
import { createResendTransport, idempotencyKeyOf } from '../../src/transport/resend.js';
import {
  OutcomeUnknownSendError,
  PermanentSendError,
  TransientSendError,
  type OutgoingMessage,
} from '../../src/transport/types.js';

const message: OutgoingMessage = {
  from: { name: 'Studio, ŌPUNTIA', email: 'news@example.com' },
  to: ['person@example.com'],
  replyTo: 'hello@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  headers: { 'List-Unsubscribe': '<https://mail.example/u/t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
};

type Seen = { url: string; init: RequestInit };

function fakeFetch(answer: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const seen = { url: String(url), init: init ?? {} };
    calls.push(seen);
    return answer(seen);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Resend transport', () => {
  it('posts the message with the key, an idempotency key and the unsubscribe headers', async () => {
    const f = fakeFetch(() => json(200, { id: 're_123' }));
    const t = createResendTransport({ apiKey: 're_test_key', fetch: f.fn });
    expect(await t.send(message)).toEqual({ messageId: 're_123' });
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(headers['idempotency-key']).toBe(idempotencyKeyOf(message));
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      from: '"Studio, ŌPUNTIA" <news@example.com>',
      to: ['person@example.com'],
      reply_to: 'hello@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      headers: message.headers,
    });
  });

  it('gives a retry of the same message the same idempotency key, and another message another', () => {
    expect(idempotencyKeyOf({ ...message })).toBe(idempotencyKeyOf(message));
    expect(idempotencyKeyOf({ ...message, to: ['other@example.com'] })).not.toBe(idempotencyKeyOf(message));
    expect(idempotencyKeyOf({ ...message, headers: { ...message.headers, 'X-Test': '1' } })).not.toBe(
      idempotencyKeyOf(message),
    );
  });

  it.each([
    [429, TransientSendError],
    [500, TransientSendError],
    [503, TransientSendError],
    [409, TransientSendError],
    [422, PermanentSendError],
    [403, PermanentSendError],
    [401, PermanentSendError],
    [400, PermanentSendError],
  ])('maps HTTP %i to %o', async (status, kind) => {
    const f = fakeFetch(() => json(status, { name: 'validation_error', message: 'nope' }));
    const t = createResendTransport({ apiKey: 'k', fetch: f.fn });
    const err = await t.send(message).catch((e) => e);
    expect(err).toBeInstanceOf(kind);
    expect(err.code).toBe(status);
    expect(err.message).toContain('validation_error: nope');
  });

  it('treats a network failure as transient (the idempotency key makes a retry safe)', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const err = await createResendTransport({ apiKey: 'k', fetch: f.fn }).send(message).catch((e) => e);
    expect(err).toBeInstanceOf(TransientSendError);
  });

  it('treats a timeout as transient', async () => {
    const f = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))),
        ),
    );
    const err = await createResendTransport({ apiKey: 'k', fetch: f.fn, timeoutMs: 20 }).send(message).catch((e) => e);
    expect(err).toBeInstanceOf(TransientSendError);
  });

  it('treats an accepted answer without an id as an unknown outcome, never a retry', async () => {
    const f = fakeFetch(() => new Response('<html>ok</html>', { status: 200 }));
    const err = await createResendTransport({ apiKey: 'k', fetch: f.fn }).send(message).catch((e) => e);
    expect(err).toBeInstanceOf(OutcomeUnknownSendError);
  });

  it('verifies the key against GET /domains', async () => {
    const ok = fakeFetch(() => json(200, { data: [] }));
    await createResendTransport({ apiKey: 'k', fetch: ok.fn, baseUrl: 'https://resend.test/' }).verify();
    expect(ok.calls[0]!.url).toBe('https://resend.test/domains');
    const bad = fakeFetch(() => json(401, { name: 'missing_api_key', message: 'bad key' }));
    await expect(createResendTransport({ apiKey: 'k', fetch: bad.fn }).verify()).rejects.toBeInstanceOf(
      PermanentSendError,
    );
  });
});
