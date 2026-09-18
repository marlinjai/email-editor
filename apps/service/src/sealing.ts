import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for anything the service stores that must not be readable
 * from a database dump: stored idempotent responses (which can carry a freshly
 * minted API key) now, provider credentials from S2.
 *
 * AES-256-GCM under MAIL_SECRETS_KEY. A sealed value is text:
 *
 *   sealed:v<version>:<base64 iv>:<base64 ciphertext>:<base64 tag>
 *
 * The version names the key it was sealed with, so a rotation adds key 2, seals
 * new values with it and still opens old ones, without a flag day.
 */

export type SecretsKeys = ReadonlyMap<number, Buffer>;

const PREFIX = 'sealed:v';
const IV_BYTES = 12;

export class SealingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealingError';
  }
}

export type Sealer = { seal(plaintext: string): string; open(sealed: string): string };

export function createSealer(keys: SecretsKeys): Sealer {
  if (keys.size === 0) throw new SealingError('no secrets key configured');
  for (const [version, key] of keys) {
    if (key.length !== 32) throw new SealingError(`secrets key v${version} must be 32 bytes`);
  }
  const current = Math.max(...keys.keys());

  return {
    seal(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', keys.get(current)!, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${current}:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
    },

    open(sealed: string): string {
      const match = /^sealed:v(\d+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]*):([A-Za-z0-9+/=]+)$/.exec(sealed);
      if (!match) throw new SealingError('not a sealed value');
      const key = keys.get(Number(match[1]));
      if (!key) throw new SealingError(`sealed with key v${match[1]}, which this service does not hold`);
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(match[2]!, 'base64'));
        decipher.setAuthTag(Buffer.from(match[4]!, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(match[3]!, 'base64')), decipher.final()]).toString('utf8');
      } catch {
        throw new SealingError('sealed value failed authentication (tampered, or the wrong key)');
      }
    },
  };
}
