import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/mail',
  DASHBOARD_SERVICE_TOKEN: 'ab'.repeat(32),
  MAIL_SECRETS_KEY: 'cd'.repeat(32),
};

describe('config', () => {
  it('loads a complete environment, with defaults', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(3000);
    expect(config.secretsKeys.get(1)).toHaveLength(32);
  });

  it('names every missing variable at once', () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).problems).toEqual(
        expect.arrayContaining(['DATABASE_URL is not set', 'DASHBOARD_SERVICE_TOKEN is not set', 'MAIL_SECRETS_KEY is not set']),
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

  it('rejects a non-postgres database URL', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://x/y' })).toThrow(/DATABASE_URL/);
  });
});
