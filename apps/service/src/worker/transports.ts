import type { ProviderForSend } from '../repo/providers.js';
import type { Sealer } from '../sealing.js';
import { createResendTransport } from '../transport/resend.js';
import { createSmtpTransport, PermanentSendError, type Transport } from '../transport/index.js';

/** Gives the Transport for a provider as it is now. Tests pass a MemoryTransport instead. */
export type TransportFor = (provider: ProviderForSend) => Transport;

export type TransportCache = {
  get: TransportFor;
  /** Closes every pooled connection; the worker calls it when it stops. */
  closeAll(): Promise<void>;
};

/**
 * Builds the real transport for a provider (SMTP through nodemailer, or Resend),
 * opening the sealed credential only here, just before use. One transport per
 * provider is kept, so SMTP reuses its pooled connection; a provider edited since
 * (its `updated_at` moved: a new password, host or key) gets a fresh one and the
 * old one is closed.
 *
 * A provider without a credential cannot send: that is a permanent failure of
 * the message, reported on the recipient, not a crash of the worker.
 */
export function createTransportCache(sealer: Sealer, log: Pick<Console, 'error'> = console): TransportCache {
  const cache = new Map<string, { version: string; transport: Transport }>();

  function build(provider: ProviderForSend): Transport {
    if (!provider.secret_sealed) {
      throw new PermanentSendError(`provider ${provider.id} has no credential: add its password or API key`);
    }
    const secret = sealer.open(provider.secret_sealed);
    if (provider.kind === 'resend') return createResendTransport({ apiKey: secret });
    const c = provider.config;
    return createSmtpTransport({
      host: String(c.host),
      port: Number(c.port),
      security: c.security === 'starttls' ? 'starttls' : 'tls',
      username: String(c.username),
      password: secret,
    });
  }

  return {
    get(provider) {
      const hit = cache.get(provider.id);
      if (hit && hit.version === provider.updated_at) return hit.transport;
      if (hit) hit.transport.close().catch((err) => log.error('[worker] closing a replaced transport failed:', err));
      const transport = build(provider);
      cache.set(provider.id, { version: provider.updated_at, transport });
      return transport;
    },
    async closeAll() {
      const all = [...cache.values()];
      cache.clear();
      await Promise.allSettled(all.map((e) => e.transport.close()));
    },
  };
}
