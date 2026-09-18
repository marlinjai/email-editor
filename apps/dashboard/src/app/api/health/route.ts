import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The commit this image was built from (the GIT_SHA build argument), so a deploy can prove which build answers. */
const COMMIT = process.env.GIT_SHA ?? 'unknown';

/**
 * Liveness plus configuration: 200 only when the dashboard has what it needs to
 * reach the mail service and sign people in. Values are never echoed, only
 * whether each is present.
 */
export function GET() {
  const required = ['MAIL_SERVICE_URL', 'DASHBOARD_SERVICE_TOKEN', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'AUTH_SESSION_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  const body = { ok: missing.length === 0, commit: COMMIT, ...(missing.length ? { missing } : {}) };
  return NextResponse.json(body, { status: missing.length ? 503 : 200, headers: { 'cache-control': 'no-store' } });
}
