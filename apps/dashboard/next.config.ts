import path from 'node:path';
import type { NextConfig } from 'next';
import { assertTestAuthNotInProduction } from './src/lib/test-auth';

// `next build` and `next start` both run with NODE_ENV=production: a process
// that also carries the end-to-end sign-in bypass flag stops here, before it
// builds or serves anything (src/lib/test-auth.ts).
assertTestAuthNotInProduction();

const nextConfig: NextConfig = {
  // A self-contained server for the container image (apps/dashboard/Dockerfile).
  output: 'standalone',
  // pnpm workspace: trace dependencies from the repository root.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  experimental: {
    // Both limits are global: Next.js has no per-action body limit, and the
    // proxy's is one setting for every route. Only the CSV import needs 52 MB
    // (MAX_IMPORT_BYTES, 50 MB, plus multipart overhead); image uploads need 12.
    // A separate upload route outside the proxy could carry the large limit
    // alone, but it would skip the auth-brain gate (second factor, the `mail`
    // grant) and need a second, hand-written session check, so the larger
    // global limit is the safer trade: the proxy may buffer up to 52 MB of one
    // request before the gate refuses it, per request, and every server
    // action still needs a signed-in session before it reads anything.
    serverActions: {
      bodySizeLimit: '52mb',
    },
    // The proxy (src/proxy.ts) buffers at most this much of a body (10 MB by
    // default) and passes a truncated body on silently, so it matches the above.
    proxyClientMaxBodySize: '52mb',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
