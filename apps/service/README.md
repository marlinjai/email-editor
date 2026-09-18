---
title: Lumitra Mail service (apps/service)
type: readme
date: 2026-09-18
summary: How the mail service is built, run, tested and deployed; the S0 foundation of docs/plans/2026-09-18-mail-service.md.
---

# Lumitra Mail service

The multi-tenant mail service at `https://mail.lumitra.co`: a long-running Node 22
process (Hono on `@hono/node-server`, Postgres 17 through `postgres`). The plan and
its binding "Service architecture" section: `docs/plans/2026-09-18-mail-service.md`.

This is phase S0, the foundation: workspaces, their members, workspace API keys,
the audit log, idempotent mutations, and the deploy chain. Sending arrives in S2.

## Who can call it

| Caller | Credential | Workspace |
| --- | --- | --- |
| A client (a customer's backend, the ŌPUNTIA admin) | `Authorization: Bearer sk_live_...`, a workspace API key | the key's own, always; a key can never name another |
| The dashboard, acting for a signed-in person | `Authorization: Bearer <DASHBOARD_SERVICE_TOKEN>` plus `x-mail-subject: <auth-brain subject>` | `x-mail-workspace: <workspace id>`, and only if that subject is a member |

Membership and role are read on every dashboard call, so removing someone takes
effect on their next request. The browser never holds either credential.

Roles (`owner`, `admin`, `editor`, `viewer`) and key scopes (`full`, `read`, `send`):

| Route | Member needs | Key needs |
| --- | --- | --- |
| `GET /healthz` | none (public, checks the database, reports the served commit) | none |
| `GET /v1/workspace` | viewer | any scope |
| `PATCH /v1/workspace` | admin | full |
| `POST /v1/api-keys` (the key is in this response only), `DELETE /v1/api-keys/:id` (revokes) | admin | full |
| `GET /v1/api-keys`, `GET /v1/audit-log` | admin | full or read |
| `POST /v1/workspaces`, `GET /v1/workspaces` | dashboard only | refused |
| `GET /v1/members` | viewer, dashboard only | refused |
| `POST /v1/members`, `PATCH /v1/members/:id` | admin (owner to grant or remove the owner role), dashboard only | refused |
| `DELETE /v1/members/:id` | admin, or anyone removing themselves | refused |

A workspace never loses its last owner (`last_owner`, 409), by demotion, removal
or leaving; owner rows are locked first, so two owners demoting each other at once
cannot both succeed.

Every error is `{ "error": { "code", "message", "details"? } }`; the codes are the
ones in `@marlinjai/mail-contract`. Every response carries `x-request-id`.

**Idempotency.** Every mutating route accepts `Idempotency-Key` (1 to 255
printable characters). The same key and the same request replay the first
response with `idempotent-replayed: true`; the same key with a different request
is `idempotency_key_reused`; a key still running is `conflict`; a 5xx releases the
key so the retry runs; keys are kept 24 hours, and a claim left behind by a crashed
process is cleared after 5 minutes. Stored responses are sealed with AES-256-GCM
under `MAIL_SECRETS_KEY` (`src/sealing.ts`), since one of them is the only copy of a
freshly minted API key. Keys are scoped per workspace (and per person
for creating a workspace), in the `idempotency_keys` table, for later phases to reuse
through `idempotent()` in `src/idempotency.ts`.

## Layout

- `src/main.ts`: the two commands, `migrate` and `serve`.
- `src/app.ts`: middleware and route wiring; `src/routes/*`: one file per resource.
- `src/repo/*`: every query. Each workspace-owned function takes `workspaceId`
  first; there is no unscoped helper. The one unscoped lookup is finding a key by
  its hash, which is how its workspace is found.
- `src/auth.ts`: the two caller kinds, workspace resolution, role and scope checks.
- `src/sealing.ts`: AES-256-GCM at rest under `MAIL_SECRETS_KEY`, versioned so the
  key can rotate; S2 seals provider credentials with it.
- `migrations/NNNN_name.sql`: ordered, additive, never edited once applied (a
  checksum enforces it). `migrate` takes an advisory lock and applies each file in
  its own transaction.

## Run it locally

Secrets come from the Infisical project "Lumitra Mail"
(`f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4`, env `dev`) through the per-org
machine-identity token; no `.env` file exists or is needed.

```bash
pnpm -F @email-editor/service db:dev   # throwaway Postgres 17 on localhost:55432
pnpm -F @email-editor/service dev      # migrate, then serve on :3000 with reload
```

## Test it

```bash
pnpm -F @email-editor/service test:unit
# Integration needs Postgres: Testcontainers locally, or TEST_DATABASE_URL (what
# CI uses). Without either the run fails, never skips. With Colima on macOS:
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
  pnpm -F @email-editor/service test
```

## Deploy

A push to `main` touching `apps/service/**` runs `.github/workflows/deploy-service.yml`:
build `ghcr.io/marlinjai/email-editor-service` for linux/arm64, push, trigger the
Coolify application `c60ld4gx620wemkvvj9l9p51` through the shared
`coolify-deploy-verify@v1` workflow, then wait until every reply of `/healthz`
reports the pushed commit.

| Where | What |
| --- | --- |
| GitHub secrets | `COOLIFY_WEBHOOK`, `COOLIFY_TOKEN` (Terraform: `infra/deployments/lumitra-mail/github.tf`) |
| Coolify app env | only `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`, `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV` |
| Infisical `prod` | `DATABASE_URL`, `DASHBOARD_SERVICE_TOKEN`, `MAIL_SECRETS_KEY` |

`entrypoint.sh` refuses to start without the Coolify variables, trades the
Universal Auth pair for a short-lived token, and runs `migrate` then `serve` under
`infisical run`. The service refuses to start without its three secrets. The
Postgres (`ifq2uzzun0xg97wmx2ubq23a`) and DNS live in `infra/deployments/lumitra-mail`.

`MAIL_SECRETS_KEY` and `DASHBOARD_SERVICE_TOKEN` are 32 random bytes as 64 hex
characters, minted with the secrets proxy's `copy_secret op=generate`, separately
per environment. The dashboard (S3) receives its copy of the token with
`copy_secret op=copy`, never by hand.
