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
    serverActions: {
      // CSV imports (up to 50 MB, MAX_IMPORT_BYTES), image uploads (up to
      // 10 MB, MAX_ASSET_BYTES) and template documents (up to 1 MB) pass
      // through server actions; the rest is multipart overhead.
      bodySizeLimit: '52mb',
    },
    // The proxy (src/proxy.ts) sits in front of every server action and reads
    // at most this much of a body (10 MB by default), so it matches the above.
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
