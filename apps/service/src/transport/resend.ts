import { createHash } from 'node:crypto';
import {
  OutcomeUnknownSendError,
  PermanentSendError,
  TransientSendError,
  type OutgoingMessage,
  type SendError,
  type SendResult,
  type Transport,
} from './types.js';

export type ResendSettings = {
  /** Opened from the provider's sealed secret just before use; never logged. */
  apiKey: string;
  /** Defaults to https://api.resend.com. */
  baseUrl?: string;
  /** Injected in tests; the global fetch otherwise. */
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = 'https://api.resend.com';
const TIMEOUT_MS = 30_000;

/**
 * The key Resend deduplicates a send on for 24 hours: a digest of everything the
 * message is made of. A retry of the same message (after a timeout or a reset
 * connection, when the first attempt may have gone through) carries the same
 * key, so Resend answers with the first send instead of delivering it twice.
 * That is what lets every network failure count as transient here.
 */
export function idempotencyKeyOf(message: OutgoingMessage): string {
  const canonical = JSON.stringify([
    message.from,
    message.to,
    message.replyTo,
    message.subject,
    message.html,
    message.text ?? null,
    Object.entries(message.headers).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  return `lumitra-${createHash('sha256').update(canonical).digest('hex')}`;
}

function formatAddress(name: string, email: string): string {
  // A display name with specials is quoted, with quotes and backslashes escaped.
  const quoted = /^[\w .'-]*$/.test(name) ? name : `"${name.replace(/(["\\])/g, '\\$1')}"`;
  return name ? `${quoted} <${email}>` : email;
}

async function detailOf(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(raw) as { name?: string; message?: string };
    const text = [parsed.name, parsed.message].filter(Boolean).join(': ');
    if (text) return `${res.status} ${text}`;
  } catch {
    // not JSON: fall through to the raw body
  }
  return `${res.status} ${raw.slice(0, 500) || res.statusText}`.trim();
}

/**
 * Maps a Resend HTTP answer onto the Transport contract (src/transport/types.ts):
 * 429 (rate limited) and 5xx are transient; a 409 is Resend reporting the same
 * idempotency key still in progress, also transient; every other 4xx (invalid
 * address, unverified domain, bad key) is permanent.
 */
export function classifyResendStatus(status: number, detail: string): SendError {
  if (status === 429 || status === 409 || status >= 500) return new TransientSendError(detail, status);
  return new PermanentSendError(detail, status);
}

/** A Transport over Resend's HTTP API (`POST /emails`). */
export function createResendTransport(settings: ResendSettings): Transport {
  const base = (settings.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = settings.fetch ?? fetch;
  const timeoutMs = settings.timeoutMs ?? TIMEOUT_MS;
  const auth = { authorization: `Bearer ${settings.apiKey}` };

  async function request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      // No answer (refused, reset, timed out). Safe to retry: sends carry an idempotency key.
      throw new TransientSendError(`Resend did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      const res = await request('/emails', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': idempotencyKeyOf(message) },
        body: JSON.stringify({
          from: formatAddress(message.from.name, message.from.email),
          to: message.to,
          reply_to: message.replyTo ?? undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        }),
      });
      if (!res.ok) throw classifyResendStatus(res.status, await detailOf(res));
      const payload = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (!payload || typeof payload.id !== 'string') {
        // Accepted (2xx) but unreadable: it was probably sent, so never retry it.
        throw new OutcomeUnknownSendError(`Resend answered ${res.status} without a message id`, res.status);
      }
      return { messageId: payload.id };
    },

    async verify(): Promise<void> {
      const res = await request('/domains', { method: 'GET', headers: auth });
      if (!res.ok) throw classifyResendStatus(res.status, await detailOf(res));
    },

    async close(): Promise<void> {
      // Stateless over HTTP: nothing to release.
    },
  };
}
