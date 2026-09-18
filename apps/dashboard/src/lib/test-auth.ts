/**
 * The end-to-end tests' sign-in bypass, and the guarantees that keep it out of
 * production.
 *
 * Playwright cannot complete a real auth-brain sign-in (it needs a human's
 * password and second factor), so the e2e suite signs in by setting a cookie
 * that names a test identity. That path exists only when BOTH hold:
 *
 *   - `MAIL_DASHBOARD_TEST_AUTH=1` is set, and
 *   - `NODE_ENV` is not `production`.
 *
 * `next start`, `next build` and the standalone server in the container all run
 * with `NODE_ENV=production`, so the bypass cannot activate there whatever else
 * is set; and a production process that finds the flag set refuses to start at
 * all (`assertTestAuthNotInProduction`, called from `next.config.ts` and
 * `instrumentation.ts`), so a misconfigured deployment fails loudly instead of
 * quietly ignoring it. Both are proven by `test/test-auth.test.ts`.
 *
 * Deliberately no imports: `next.config.ts` loads this module too.
 */

export const TEST_AUTH_ENV = 'MAIL_DASHBOARD_TEST_AUTH';
export const TEST_AUTH_COOKIE = 'mail_test_identity';

type Env = Record<string, string | undefined>;

export function testAuthEnabled(env: Env = process.env): boolean {
  return env[TEST_AUTH_ENV] === '1' && env.NODE_ENV !== 'production';
}

export class TestAuthInProductionError extends Error {
  constructor() {
    super(
      `${TEST_AUTH_ENV} is set in a production process. It enables a sign-in bypass that exists only for the end-to-end tests; unset it. Refusing to start.`,
    );
    this.name = 'TestAuthInProductionError';
  }
}

/** Throws when the flag is present at all in a production process. */
export function assertTestAuthNotInProduction(env: Env = process.env): void {
  const flag = env[TEST_AUTH_ENV];
  if (flag !== undefined && flag !== '' && env.NODE_ENV === 'production') {
    throw new TestAuthInProductionError();
  }
}

/** A test identity as the e2e suite writes it into the cookie. */
export type TestIdentity = {
  subject: string;
  email: string;
  name: string | null;
  companies: Array<{ id: string; name: string }>;
};

export function encodeTestIdentity(identity: TestIdentity): string {
  return Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url');
}

/** Parses the cookie; anything malformed is no identity at all. */
export function decodeTestIdentity(value: string | undefined): TestIdentity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TestIdentity>;
    if (typeof parsed.subject !== 'string' || parsed.subject.length === 0) return null;
    if (typeof parsed.email !== 'string' || !parsed.email.includes('@')) return null;
    const companies = Array.isArray(parsed.companies)
      ? parsed.companies.filter(
          (c): c is { id: string; name: string } => typeof c?.id === 'string' && typeof c?.name === 'string',
        )
      : [];
    return {
      subject: parsed.subject,
      email: parsed.email,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      companies,
    };
  } catch {
    return null;
  }
}
