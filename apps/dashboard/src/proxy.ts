import { NextResponse, type NextRequest } from 'next/server';
import { auth } from './lib/auth';
import { TEST_AUTH_COOKIE, testAuthEnabled } from './lib/test-auth';

/**
 * The one gate in front of every page, route handler and server action (Next 16
 * "Proxy", the renamed Middleware; it runs on Node.js by default and must not
 * declare a runtime).
 *
 * auth-brain's OpenID Connect middleware decides: a valid dashboard session
 * passes; an unauthenticated page navigation is sent to /sign-in (after a silent
 * sign-in attempt); a signed-in person whose companies lack the `mail` grant
 * lands on /no-access; an /api request without a session is a 401.
 *
 * The only other door is the end-to-end tests' identity cookie, honoured solely
 * when `testAuthEnabled()` (never in a production process, src/lib/test-auth.ts).
 */
const gate = auth.createAuthMiddleware();

export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  if (testAuthEnabled()) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith('/api/test-auth/') || request.cookies.has(TEST_AUTH_COOKIE)) return NextResponse.next();
  }
  return gate(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
