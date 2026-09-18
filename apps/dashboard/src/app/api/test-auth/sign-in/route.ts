import { NextResponse, type NextRequest } from 'next/server';
import { encodeTestIdentity, TEST_AUTH_COOKIE, testAuthEnabled, type TestIdentity } from '@/lib/test-auth';

export const dynamic = 'force-dynamic';

/**
 * End-to-end tests only: sets the identity cookie the proxy and `getViewer`
 * honour when `testAuthEnabled()`. In every other process this route does not
 * exist (404), and the cookie it would set is ignored anyway.
 */
export async function POST(req: NextRequest) {
  if (!testAuthEnabled()) return new NextResponse(null, { status: 404 });
  const identity = (await req.json()) as TestIdentity;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEST_AUTH_COOKIE, encodeTestIdentity(identity), { httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
