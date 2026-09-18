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
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // shared address space, RFC 6598 (carrier-grade NAT, Tailscale)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/**
 * The eight 16-bit groups of an IPv6 address, or null when it is not one.
 * Handles `::` and a dotted IPv4 tail, so `::ffff:127.0.0.1` and the form the
 * WHATWG URL parser normalises it to, `::ffff:7f00:1`, read the same.
 */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().replace(/%.*$/, ''); // drop a zone id
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const octets = dotted[1]!.split('.').map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o > 255)) return null;
    text = `${text.slice(0, -dotted[1]!.length)}${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)));
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
  return groups.some((g) => Number.isNaN(g)) ? null : groups;
}

function embeddedIpv4(groups: number[]): string {
  const [hi, lo] = [groups[6]!, groups[7]!];
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isDisallowedIpv6(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return true; // unreadable: refuse
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // unspecified
  if (zeroUpTo(7) && g[7] === 1) return true; // loopback
  if (zeroUpTo(5) && g[5] === 0xffff) return isDisallowedIpv4(embeddedIpv4(g)); // IPv4-mapped
  if (zeroUpTo(6)) return true; // IPv4-compatible (deprecated): never a real public target
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isDisallowedIpv4(embeddedIpv4(g)); // NAT64
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local, fe80::/10
  if ((g[0]! & 0xffc0) === 0xfec0) return true; // site-local (deprecated), fec0::/10
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local, fc00::/7
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
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
