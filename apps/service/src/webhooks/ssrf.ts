import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApiError } from '../api-error.js';

/**
 * The server-side request forgery (SSRF) guard for webhook endpoints: a
 * workspace admin could otherwise point a webhook at the service's own
 * internal network (a database, a cloud metadata endpoint) and have the
 * delivery loop's server make that request on their behalf.
 *
 * Two checks:
 * - `assertHttpsUnlessDev`: production only accepts `https://` endpoints.
 *   Plain `http://` is refused unless the caller passes `allowInsecureHttp`
 *   (an explicit dev flag, never on by default), whatever the hostname; this is
 *   stricter than the contract's `WebhookUrl`, which always allows `http` for
 *   `localhost`/`127.0.0.1` so the SDK's own examples type-check.
 * - `assertResolvesToPublicAddress`: refuses a hostname that resolves to a
 *   private, loopback or link-local address. Called both when an endpoint is
 *   created or updated, and again immediately before every send (the same
 *   hostname can resolve differently between the two: DNS rebinding), unless
 *   the caller passes `allowPrivateTargets` (the same dev flag, for the local
 *   HTTP receiver integration tests use).
 */

export type ResolvedAddress = { address: string; family: number };

export type SsrfPolicy = {
  allowInsecureHttp?: boolean;
  allowPrivateTargets?: boolean;
  /** Replaces DNS resolution; tests use it to make a hostname change its answer between create and send. */
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
};

export function assertHttpsUnlessDev(url: string, policy: SsrfPolicy = {}): void {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && policy.allowInsecureHttp) return;
  throw new ApiError(
    'invalid_request',
    'Webhook endpoints must use https. http is only accepted with an explicit development flag.',
  );
}

function isDisallowedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  return false;
}

function isDisallowedIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true; // unspecified
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local, fc00::/7
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isDisallowedIpv4(mapped[1]!);
  return false;
}

export function isDisallowedAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? isDisallowedIpv4(address) : isDisallowedIpv6(address);
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/** Resolves `hostname` and refuses if any answer, or a literal IP, is private, loopback or link-local. */
export async function assertResolvesToPublicAddress(hostname: string, policy: SsrfPolicy = {}): Promise<void> {
  if (policy.allowPrivateTargets) return;
  const literal = isIP(hostname) as 0 | 4 | 6;
  if (literal !== 0) {
    if (isDisallowedAddress(hostname, literal)) {
      throw new SsrfBlockedError(`refuses to send to ${hostname}: a private, loopback or link-local address`);
    }
    return;
  }
  let answers: ResolvedAddress[];
  try {
    answers = await (policy.resolve ?? ((h) => lookup(h, { all: true, verbatim: true })))(hostname);
  } catch {
    throw new SsrfBlockedError(`could not resolve ${hostname}`);
  }
  if (answers.length === 0) throw new SsrfBlockedError(`could not resolve ${hostname}`);
  for (const a of answers) {
    if (isDisallowedAddress(a.address, a.family as 4 | 6)) {
      throw new SsrfBlockedError(`refuses to send to ${hostname}: resolves to ${a.address}, a private, loopback or link-local address`);
    }
  }
}

/** Both checks, for a URL a caller is about to create, update or send to. Throws `ApiError` or `SsrfBlockedError`. */
export async function assertWebhookUrlAllowed(url: string, policy: SsrfPolicy = {}): Promise<void> {
  assertHttpsUnlessDev(url, policy);
  await assertResolvesToPublicAddress(new URL(url).hostname, policy);
}
