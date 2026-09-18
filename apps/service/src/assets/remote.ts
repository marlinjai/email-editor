import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { ApiError } from '../api-error.js';
import { assertResolvesToPublicAddress, isDisallowedAddress, SsrfBlockedError, type SsrfPolicy } from '../webhooks/ssrf.js';

/**
 * Fetching a remote image for `assets.import`, from the service's own network,
 * so it carries the server-side request forgery (SSRF) guard of webhook
 * endpoints (`SsrfPolicy`, the same `WEBHOOK_ALLOW_INSECURE_TARGETS` flag):
 *
 * - `http` and `https` only.
 * - The hostname must resolve to public addresses only. The check runs before
 *   the request and again inside the socket's own DNS lookup, on the very
 *   addresses the connection then uses, so a name that changes its answer
 *   between the two (DNS rebinding) cannot reach a private address.
 * - Redirects are never followed (a redirect could point anywhere); a 3xx is
 *   refused.
 * - At most `maxBytes`, enforced on `Content-Length` and again while reading,
 *   so a missing or lying header cannot make the service buffer more.
 * - One deadline for the whole exchange.
 *
 * The remote `Content-Type` is ignored: the caller sniffs the bytes.
 */

export type RemoteFetchOptions = {
  policy: SsrfPolicy;
  maxBytes: number;
  timeoutMs: number;
};

export type FetchedImage = { bytes: Buffer; finalName: string | null };

const USER_AGENT = 'LumitraMail-AssetImport/1.0 (+https://mail.lumitra.co)';

/** The socket's DNS lookup, refusing any private, loopback or link-local answer. */
function guardedLookup(policy: SsrfPolicy): LookupFunction {
  return (hostname, options, callback) => {
    const done = (err: NodeJS.ErrnoException | null, answers: LookupAddress[]) => {
      if (err) return callback(err, '', 0);
      if (answers.length === 0) return callback(new SsrfBlockedError(`could not resolve ${hostname}`), '', 0);
      if (!policy.allowPrivateTargets) {
        const bad = answers.find((a) => isDisallowedAddress(a.address, a.family as 4 | 6));
        if (bad) {
          return callback(new SsrfBlockedError(`refuses to fetch from ${hostname}: resolves to ${bad.address}, a private, loopback or link-local address`), '', 0);
        }
      }
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, answers);
      return callback(null, answers[0]!.address, answers[0]!.family);
    };
    if (policy.resolve) {
      policy.resolve(hostname).then(
        (answers) => done(null, answers),
        (err: NodeJS.ErrnoException) => done(err, []),
      );
      return;
    }
    dnsLookup(hostname, { all: true, verbatim: true }, (err, answers) => done(err, answers ?? []));
  };
}

function nameFromUrl(url: URL): string | null {
  const last = decodeURIComponent(url.pathname.split('/').pop() ?? '').trim();
  return last.length > 0 ? last : null;
}

function upstreamFailure(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError('provider_error', message, { service: 'asset_import', ...details });
}

export async function fetchRemoteImage(rawUrl: string, options: RemoteFetchOptions): Promise<FetchedImage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError('invalid_request', 'The address is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('invalid_request', 'Only http and https addresses can be imported.');
  }
  if (url.username || url.password) {
    throw new ApiError('invalid_request', 'An address with credentials in it cannot be imported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  try {
    await assertResolvesToPublicAddress(hostname, options.policy);
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw new ApiError('invalid_request', `The address cannot be imported: ${err.message}.`);
    throw err;
  }

  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<FetchedImage>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = send(
      url,
      {
        method: 'GET',
        headers: { 'user-agent': USER_AGENT, accept: 'image/png, image/jpeg, image/gif, image/webp;q=0.9, */*;q=0.1' },
        // A literal IP never goes through lookup; it was checked above.
        ...(isIP(hostname) === 0 ? { lookup: guardedLookup(options.policy) } : {}),
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return finish(() =>
            reject(new ApiError('invalid_request', `The address answered with a redirect (${status}); redirects are not followed. Import the final address.`, { status })),
          );
        }
        if (status >= 400 && status < 500) {
          res.resume();
          return finish(() => reject(new ApiError('invalid_request', `The address answered ${status}.`, { status })));
        }
        if (status !== 200) {
          res.resume();
          return finish(() => reject(upstreamFailure(`The remote server answered ${status}.`, { status })));
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          res.destroy();
          return finish(() =>
            reject(new ApiError('payload_too_large', `The image is ${declared} bytes; the limit is ${options.maxBytes}.`, { limit_bytes: options.maxBytes })),
          );
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            res.destroy();
            finish(() =>
              reject(new ApiError('payload_too_large', `The image is larger than the limit of ${options.maxBytes} bytes.`, { limit_bytes: options.maxBytes })),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => finish(() => resolve({ bytes: Buffer.concat(chunks), finalName: nameFromUrl(url) })));
        res.on('error', (err) => finish(() => reject(upstreamFailure(`Reading the image failed: ${err.message}.`))));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(upstreamFailure(`The remote server did not answer within ${options.timeoutMs} ms.`)));
    }, options.timeoutMs);
    req.on('error', (err) => {
      if (err instanceof SsrfBlockedError) {
        return finish(() => reject(new ApiError('invalid_request', `The address cannot be imported: ${err.message}.`)));
      }
      finish(() => reject(upstreamFailure(`The image could not be fetched: ${err.message}.`)));
    });
    req.end();
  });
}
