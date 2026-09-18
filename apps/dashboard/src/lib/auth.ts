import { createAuthBrainNextjs } from '@marlinjai/auth-brain-nextjs';

/**
 * Sign-in through auth-brain's OpenID Connect (OIDC) provider, the pattern
 * ŌPUNTIA's Studio uses (opuntia-website lib/auth.ts): the dashboard is a
 * registered client of https://auth.lumitra.co, keeps its own host-only session
 * cookie, and admits a person only when one of their companies holds the `mail`
 * app grant. Everyone else who signs in lands on /no-access.
 *
 * Every secret is an env var read lazily by the package (`OIDC_CLIENT_ID`,
 * `OIDC_CLIENT_SECRET`, `AUTH_SESSION_SECRET`), so `next build` needs none.
 */
export const auth = createAuthBrainNextjs({
  appName: 'mail',
  mode: {
    oidc: {
      // The dashboard shows contacts, archived mail and API keys: a second
      // factor is required, as for the Studio.
      requireAmr: ['mfa'],
      noAccessPath: '/no-access',
      // A branded landing with a popup sign-in; a warm auth.lumitra.co session
      // signs in silently first and never sees it.
      signInPath: '/sign-in',
    },
  },
  workspaces: { appGrant: { app: 'mail' } },
  permissions: { 'mail.use': 'workspace.member' },
  publicPaths: ['/api/health', '/sign-in', '/no-access'],
  publicUrl: 'https://app.mail.lumitra.co',
  publicUrlEnvVar: 'DASHBOARD_PUBLIC_URL',
});
