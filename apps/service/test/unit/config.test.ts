import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/mail',
  DASHBOARD_SERVICE_TOKEN: 'ab'.repeat(32),
  MAIL_SECRETS_KEY: 'cd'.repeat(32),
  PUBLIC_BASE_URL: 'https://mail.lumitra.co',
  STORAGE_BRAIN_API_KEY: `sk_test_${'x'.repeat(32)}`,
  MAIL_UNSUBSCRIBE_KEY: 'ef'.repeat(32),
};

describe('config', () => {
  it('loads a complete environment, with defaults', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(3000);
    expect(config.secretsKeys.get(1)).toHaveLength(32);
    expect(config.compile).toEqual({ workers: 2, timeoutMs: 10_000, maxQueue: 32 });
    expect(config.storageBrain.baseUrl).toBeUndefined();
    expect(config.unsubscribeKeys.get(1)).toHaveLength(32);
  });

  it('names every missing variable at once', () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).problems).toEqual(
        expect.arrayContaining([
          'DATABASE_URL is not set',
          'DASHBOARD_SERVICE_TOKEN is not set',
          'MAIL_SECRETS_KEY is not set',
          'PUBLIC_BASE_URL is not set',
          'STORAGE_BRAIN_API_KEY is not set',
          'MAIL_UNSUBSCRIBE_KEY is not set',
        ]),
      );
    }
  });

  it('never echoes a malformed secret value', () => {
    const secret = 'not-a-hex-secret-value-but-still-sensitive';
    try {
      loadConfig({ ...valid, MAIL_SECRETS_KEY: secret });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('MAIL_SECRETS_KEY');
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('never echoes a malformed Storage Brain key', () => {
    const secret = 'pk_live_this-is-sensitive-anyway';
    try {
      loadConfig({ ...valid, STORAGE_BRAIN_API_KEY: secret });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('STORAGE_BRAIN_API_KEY');
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('accepts the public origin only as https (http for localhost), without a path', () => {
    expect(loadConfig({ ...valid, PUBLIC_BASE_URL: 'http://localhost:3000' }).publicBaseUrl).toBe('http://localhost:3000');
    expect(() => loadConfig({ ...valid, PUBLIC_BASE_URL: 'http://mail.lumitra.co' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => loadConfig({ ...valid, PUBLIC_BASE_URL: 'https://mail.lumitra.co/' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => loadConfig({ ...valid, PUBLIC_BASE_URL: 'https://mail.lumitra.co/x' })).toThrow(/PUBLIC_BASE_URL/);
  });

  it('refuses to boot without the unsubscribe key, or with a malformed one', () => {
    const { MAIL_UNSUBSCRIBE_KEY: _omitted, ...withoutKey } = valid;
    expect(() => loadConfig(withoutKey)).toThrow(/MAIL_UNSUBSCRIBE_KEY is not set/);
    expect(() => loadConfig({ ...valid, MAIL_UNSUBSCRIBE_KEY: 'ab'.repeat(16) })).toThrow(/MAIL_UNSUBSCRIBE_KEY: must be 64 hex/);
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://x/y' })).toThrow(/DATABASE_URL/);
  });
});
