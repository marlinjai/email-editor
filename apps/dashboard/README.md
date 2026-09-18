---
title: Lumitra Mail dashboard (apps/dashboard)
type: readme
date: 2026-09-18
summary: How the dashboard at app.mail.lumitra.co is built, signs people in, reaches the mail service, is tested and deployed; phase S3 of docs/plans/2026-09-18-mail-service.md.
---

# Lumitra Mail dashboard

The human interface of Lumitra Mail at `https://app.mail.lumitra.co`: everything a
client can do through the v1 API, a person can do here. Next.js 16 (App Router),
React 19, Tailwind CSS 4, dark only in the Lumitra black and brushed gold. The plan
and its binding "Service architecture" section: `docs/plans/2026-09-18-mail-service.md`.

## How it is put together

- **Sign-in** is auth-brain's OpenID Connect (OIDC) provider, exactly as the ŌPUNTIA
  Studio does it (`src/lib/auth.ts`, `src/proxy.ts`, `/api/auth/[action]`, the
  branded `/sign-in` with a popup, and silent sign-in for a warm auth.lumitra.co
  session). A person gets in only when one of their companies holds the `mail` app
  grant; anyone else lands on `/no-access`. A second factor is required
  (`requireAmr: ['mfa']`), since the dashboard shows contacts, archived mail and API
  keys.
- **All data goes through the SDK's dashboard client, server-side only**
  (`src/lib/mail.ts`, imported only by server components and server actions, and
  marked `server-only`). It authenticates with `DASHBOARD_SERVICE_TOKEN` and names
  the signed-in person's auth-brain subject and the workspace on every call; the
  service checks membership and role each time. The browser never sees the token or
  any API key; a key or webhook secret the service mints is shown once in a dialog.
- **Workspaces** live in the URL (`/w/<id>/...`) and are always checked against the
  person's own memberships (`src/lib/workspace.ts`). A new workspace is stamped with
  the person's auth-brain company, which is how auth-brain's company erasure finds it
  (the service's `POST /internal/erasure`).
- **Errors** from the service come back as the contract's error codes and are shown
  as sentences a person can act on (`src/lib/errors.ts`), with the request id for
  support. Every screen has its empty, loading and error states, and one failing call
  never blanks a page.
- **Destructive actions** use the branded confirmation dialog on the native
  `<dialog>` (`src/components/dialog.tsx`); the irreversible ones (erasing a contact,
  revoking a key, lifting an unsubscribe) ask for the name to be typed.
- **Mailings** follow the contract's `MAILING_TRANSITIONS` for their controls
  (`src/lib/mailing-status.ts`) and poll for live counts while the worker can still
  move them; a reload resumes from the service's state.
- **Rendered email** (template previews, the mailing preview, archived messages) is
  shown in an `<iframe sandbox="">` with `srcDoc`: no scripts, no same-origin, no
  navigation.

## Members join by invitation

The service binds members by auth-brain subject, and only auth-brain's admin API
could look a subject up by email. So an admin creates an invitation link for one
address and role (`src/lib/invite-token.ts`): signed with a key derived from
`AUTH_SESSION_SECRET`, valid seven days. The invitee opens it, signs in with that
address, and accepts; the dashboard then adds them on the inviter's behalf, and the
service checks at that moment that the inviter may still add members and grant the
role. Accepting twice is harmless. The invitee's company needs the `mail` grant.

## Run it locally

```bash
pnpm -F @email-editor/service db:dev   # Postgres for the service
pnpm -F @email-editor/service dev      # the service on :3000
pnpm -F @email-editor/dashboard dev    # the dashboard on :3100
```

`dev` reads the Infisical project "Lumitra Mail" (`f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4`),
env `dev`, path `/dashboard`, through the per-org machine-identity token. Production
auth-brain refuses `http://localhost` redirect URIs, so there is no local OIDC client:
`dev` runs with `MAIL_DASHBOARD_TEST_AUTH=1` (development mode only, see below), and you
sign in by setting the test identity cookie once, from the browser's devtools console
on `http://localhost:3100/sign-in`:

```js
await fetch('/api/test-auth/sign-in', {
  method: 'POST',
  body: JSON.stringify({ subject: 'dev-you', email: 'you@example.com', name: 'You', companies: [{ id: 'dev-company', name: 'Dev' }] }),
});
location.href = '/';
```

## The test-only sign-in bypass

Playwright cannot complete a real sign-in, so the end-to-end suite signs in with an
identity cookie that `POST /api/test-auth/sign-in` sets. It works only when
`MAIL_DASHBOARD_TEST_AUTH=1` **and** `NODE_ENV` is not `production`
(`src/lib/test-auth.ts`). `next build`, `next start` and the container's standalone
server all run in production mode, and a production process that finds the flag set
refuses to start (`next.config.ts`, `src/instrumentation-node.ts`).
`test/e2e/prod-guard.spec.ts` proves both, and that a forged cookie opens nothing.

## Test it

```bash
pnpm -F @email-editor/dashboard lint     # next typegen, then tsc
pnpm -F @email-editor/dashboard test     # vitest: actions with a mocked SDK, helpers
pnpm -F @email-editor/service build      # the end-to-end suite runs the built service
pnpm -F @email-editor/dashboard build    # the production guard starts this build
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
TESTCONTAINERS_RYUK_DISABLED=true \
  pnpm -F @email-editor/dashboard test:e2e
```

The end-to-end stack (`test/e2e/stack.ts`): Postgres 17 (Testcontainers, or
`TEST_DATABASE_URL` in CI), the mail service as a subprocess of its built
`dist/main.js` with its real send worker, an SMTP sink with TLS the worker delivers
to, and a Storage Brain stand-in for image uploads. A control server lets a test
slow the sink, make it refuse addresses, and restart the service mid-send. The
mailing flow is covered on the four paths of the stateful-flow standard: forward,
backtrack and revise, resume (a reload and a service restart mid-send), and re-entry
(retry the failed, duplicate, a cancelled mailing is read-only).

## Deploy

A push to `main` touching the dashboard or the packages it builds from runs
`.github/workflows/deploy-dashboard.yml`: build `ghcr.io/marlinjai/email-editor-dashboard`
for linux/arm64, push, trigger the Coolify application `e6fm7v8mv1nfaj3jg5w4n5ib`
through the shared `coolify-deploy-verify@v1` workflow, then wait until every reply of
`https://app.mail.lumitra.co/api/health` reports the pushed commit.

| Where | What |
| --- | --- |
| GitHub secrets | `COOLIFY_WEBHOOK_DASHBOARD`, `COOLIFY_TOKEN` (Terraform: `infra/deployments/lumitra-mail`) |
| Coolify app env | only `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`, `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV` |
| Infisical `prod`, path `/dashboard` | `MAIL_SERVICE_URL`, `DASHBOARD_PUBLIC_URL`, `DASHBOARD_SERVICE_TOKEN` (a copy of the service's), `AUTH_SESSION_SECRET`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |

`entrypoint.sh` injects only the `/dashboard` path, so the container never holds the
service's database URL or encryption keys. `/api/health` answers 503, naming the
missing variables (never their values), until all are present. The OIDC client
("Lumitra Mail dashboard", app slug `mail`, redirect
`https://app.mail.lumitra.co/api/auth/callback`) is registered in auth-brain and listed
in its `docs/internal/oidc-clients.md`.
