import { z } from 'zod';

/**
 * The service's whole runtime configuration, read once at boot from the
 * environment (which `infisical run` populates in the container). A missing or
 * malformed value stops the process before it listens, naming the variable, so a
 * half-configured container never passes a healthcheck.
 */
const hex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'must be 64 hex characters (32 random bytes), as minted by copy_secret op=generate');

const EnvSchema = z.object({
  DATABASE_URL: z.string().url().refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// URL'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Shared with the dashboard only. Lets it act for a signed-in auth-brain subject. */
  DASHBOARD_SERVICE_TOKEN: hex64,
  /**
   * Version 1 of the key that encrypts provider credentials at rest (AES-256-GCM,
   * used from S2). Ciphertexts record the key version they were sealed with, so a
   * rotation adds MAIL_SECRETS_KEY_V2 and re-seals, without a flag day.
   */
  MAIL_SECRETS_KEY: hex64,
  /**
   * Version 1 of the HMAC-SHA256 key that signs hosted unsubscribe links
   * (src/unsubscribe.ts). Versioned the same way: a rotation adds
   * MAIL_UNSUBSCRIBE_KEY_V2, and links signed under v1 keep working while v1 is held.
   */
  MAIL_UNSUBSCRIBE_KEY: hex64,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * The service's public origin, e.g. https://mail.lumitra.co. Asset URLs put
   * into mail are built on it, so it is configured, never guessed from a Host
   * header a client controls.
   */
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .refine((v) => /^https:\/\//.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v), 'must be https (http only for localhost)')
    .refine((v) => new URL(v).pathname === '/' && !v.endsWith('/'), 'must be an origin without a path or trailing slash'),
  /** The mail service's Storage Brain tenant key, where uploaded images are stored. */
  STORAGE_BRAIN_API_KEY: z.string().regex(/^sk_(live|test)_[A-Za-z0-9_-]{16,}$/, 'must be a Storage Brain key (sk_live_... or sk_test_...)'),
  /** Storage Brain's API origin; the SDK's default (production) when unset. */
  STORAGE_BRAIN_URL: z.string().url().optional(),
  /** Worker threads compiling MJML. */
  COMPILE_WORKERS: z.coerce.number().int().min(1).max(16).default(2),
  /** Deadline for one compile; a compile past it is stopped and reported in `errors`. */
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  /** Compiles allowed to wait for a free worker before new ones get 503. */
  COMPILE_MAX_QUEUE: z.coerce.number().int().min(0).max(1000).default(32),
});

export type Config = {
  databaseUrl: string;
  port: number;
  dashboardServiceToken: string;
  secretsKeys: ReadonlyMap<number, Buffer>;
  unsubscribeKeys: ReadonlyMap<number, Buffer>;
  databasePoolMax: number;
  publicBaseUrl: string;
  storageBrain: { apiKey: string; baseUrl?: string };
  compile: { workers: number; timeoutMs: number; maxQueue: number };
};

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Parses the environment. Never echoes a value, only the variable names at fault. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => {
        const name = i.path.join('.');
        return env[name] === undefined || env[name] === '' ? `${name} is not set` : `${name}: ${i.message}`;
      }),
    );
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    dashboardServiceToken: e.DASHBOARD_SERVICE_TOKEN.toLowerCase(),
    secretsKeys: new Map([[1, Buffer.from(e.MAIL_SECRETS_KEY, 'hex')]]),
    unsubscribeKeys: new Map([[1, Buffer.from(e.MAIL_UNSUBSCRIBE_KEY, 'hex')]]),
    databasePoolMax: e.DATABASE_POOL_MAX,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    storageBrain: { apiKey: e.STORAGE_BRAIN_API_KEY, baseUrl: e.STORAGE_BRAIN_URL },
    compile: { workers: e.COMPILE_WORKERS, timeoutMs: e.COMPILE_TIMEOUT_MS, maxQueue: e.COMPILE_MAX_QUEUE },
  };
}

/** What `migrate` needs: the database and nothing else. */
export function loadMigrateConfig(env: NodeJS.ProcessEnv = process.env): { databaseUrl: string } {
  const parsed = EnvSchema.pick({ DATABASE_URL: true }).safeParse(env);
  if (!parsed.success) {
    throw new ConfigError([env.DATABASE_URL ? 'DATABASE_URL: must be a postgres:// URL' : 'DATABASE_URL is not set']);
  }
  return { databaseUrl: parsed.data.DATABASE_URL };
}
