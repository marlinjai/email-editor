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

Phase S0 laid the foundation: workspaces, their members, workspace API keys, the
audit log, idempotent mutations, and the deploy chain. Phase S1 adds templates
with their version history, compilation to MJML (Mailjet Markup Language) and
HTML, and uploaded images. Sending arrives in S2.

## Who can call it

| Caller | Credential | Workspace |
| --- | --- | --- |
| A client (a customer's backend, the ŌPUNTIA admin) | `Authorization: Bearer sk_live_...`, a workspace API key | the key's own, always; a key can never name another |
| The dashboard, acting for a signed-in person | `Authorization: Bearer <DASHBOARD_SERVICE_TOKEN>` plus `x-mail-subject: <auth-brain subject>` | `x-mail-workspace: <workspace id>`, and only if that subject is a member |

Membership and role are read on every dashboard call, so removing someone takes
effect on their next request. The browser never holds either credential.

Who may call what comes from the route table in `@marlinjai/mail-contract`
(`routes`): every operation is registered through `mount()` (`src/mount.ts`), which
takes its method, path, access level and idempotency from the table, so the
service cannot drift from what the SDK and the dashboard are built against. The
access levels map to roles (`owner`, `admin`, `editor`, `viewer`) and key scopes
(`full`, `send`, `read`) in `ACCESS_RULES` (`src/auth.ts`):

| Access | Member needs | Key needs | S0 operations |
| --- | --- | --- | --- |
| `read` | viewer | any scope | `workspace.get`, `members.list`, `templates.list`, `templates.get`, `templates.versions`, `templates.version`, `templates.compile`, `compile`, `assets.get` |
| `write` | editor | send or full | `templates.create`, `templates.update`, `templates.delete`, `assets.upload` |
| `admin` | admin | full | `workspace.update`, `members.add`, `members.update`, `members.remove`, `apiKeys.create` (the key is in this response only), `apiKeys.list`, `apiKeys.revoke`, `audit.list` |
| `dashboard` | a signed-in person, no workspace yet | refused | `workspaces.create`, `workspaces.list` |

On top of the table: only an owner, signed in through the dashboard, grants or
takes away the owner role (a key never can), and any member may remove
themselves (`members.remove` for your own member id). `GET /healthz` is public; it
checks the database and reports the served commit.

A workspace never loses its last owner (`last_owner`, 409), by demotion, removal
or leaving; owner rows are locked first, so two owners demoting each other at once
cannot both succeed.

Every error is `{ "error": { "code", "message", "details"? } }`, built with the
contract's `errorBody` and `ERROR_STATUS`. Ids are opaque strings in the contract;
an id this service never issued is `not_found`. Every response carries `x-request-id`.

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

## Templates, compile and assets (S1)

**Documents.** Every document the service stores or compiles is first run
through the editor core's `migrateTemplate` (`src/documents.ts`), which checks
the full block schema. A rejected document is `validation_failed` with the core's
reason in `details.reason` (`INVALID_DOCUMENT`, `NEWER_VERSION` for a document
from a newer editor, with `details.document_version`, `UNSUPPORTED_VERSION`,
`MISSING_VERSION`) and the failing paths in `details.issues`. A document over
`MAX_DOCUMENT_BYTES` is `payload_too_large`.

**Versions.** `templates.version` is an optimistic lock: a save sends
`base_version`, and if someone saved since, the answer is `conflict` (409) with
`details.current_version`, and nothing is overwritten (the row is locked, so of
two saves racing on the same base exactly one wins). Every real change bumps
the version and appends the document to `template_versions` in the same
transaction; a save identical to the current state (JSON compared as `jsonb`, so
key order does not matter) keeps the version. History is append-only, enforced
by a trigger. Restoring an old version is a save of that version's document on
the current `base_version`, which becomes a new version. `created_by` is
`api_key:<id>` or `member:<member id>`.

**Compile.** `POST /v1/templates/:id/compile` (optionally `{ version }`) and
`POST /v1/compile` (an unsaved document) always answer 200 with
`{ mjml, html, warnings, errors }` once the document is readable; a non-empty
`errors` means not sendable. MJML's messages are rewritten to
`{ message, line, path }` without the server's file paths. MJML runs in a pool of
worker threads (`src/compile/pool.ts`, `src/compile-worker.js`), never on the
request thread: a compile past `COMPILE_TIMEOUT_MS` is stopped (its worker
terminated and replaced) and answered with an error, and when every worker is
busy and `COMPILE_MAX_QUEUE` jobs wait, a new compile is `service_unavailable`
(503, retryable). A test proves other requests keep being answered during a
multi-second compile.

**Assets.** `POST /v1/assets` takes `multipart/form-data` with one `file` field,
up to `MAX_ASSET_BYTES` (the 1 MiB JSON body limit does not apply to this route).
The type is sniffed from the bytes (PNG, JPEG, GIF, WebP; never SVG); the name
and the declared type are not trusted, and anything else is
`unsupported_media_type`. The bytes go to Storage Brain (one tenant for the
service, each file labelled `mail/<workspace id>`); the row keeps the sniffed
type, size, dimensions and a SHA-256. The answer's `url` is
`<PUBLIC_BASE_URL>/a/<id>`: public, stable for the asset's life, safe in a mail.
`GET /a/:id` mints a five-minute signed Storage Brain URL on every request,
fetches through it server-side and streams the bytes with the stored
`Content-Type`, `Content-Length`, `Cache-Control: public, max-age=31536000,
immutable`, an `ETag` (the SHA-256, so `If-None-Match` gets 304 without touching
Storage Brain) and `nosniff`. An unknown id is 404 (cached a minute); Storage
Brain unreachable is 503 with `Retry-After`, never cached. With an
`Idempotency-Key`, a retried upload replays the first answer; the fingerprint is
the parsed parts (a new multipart boundary on the retry still matches).

## Layout

- `src/main.ts`: the two commands, `migrate` and `serve`.
- `src/app.ts`: middleware and wiring; `src/routes/*`: one file per resource, each
  operation registered with `mount()`. Request and response shapes are the
  contract's; `test/integration/contract.test.ts` parses every S0 response with them.
- `src/repo/*`: every query. Each workspace-owned function takes `workspaceId`
  first; there is no unscoped helper. The one unscoped lookup is finding a key by
  its hash, which is how its workspace is found.
- `src/auth.ts`: the two caller kinds, workspace resolution, role and scope checks.
- `src/sealing.ts`: AES-256-GCM at rest under `MAIL_SECRETS_KEY`, versioned so the
  key can rotate; S2 seals provider credentials with it.
- `migrations/NNNN_name.sql`: ordered, additive, never edited once applied (a
  checksum enforces it). `migrate` takes an advisory lock and applies each file in
  its own transaction. It applies every file not yet recorded in `_migrations`, in
  name order, so a lower-numbered file that lands later (for example 0002 from a
  branch merged after 0003) is applied on the next run. That is only safe while
  files do not depend on each other out of order: 0003 references nothing 0002
  creates, and `test/integration/migrations.test.ts` proves the late arrival.

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
| Infisical `prod` | `DATABASE_URL`, `DASHBOARD_SERVICE_TOKEN`, `MAIL_SECRETS_KEY`, `MAIL_UNSUBSCRIBE_KEY`, `PUBLIC_BASE_URL` (`https://mail.lumitra.co`), `STORAGE_BRAIN_API_KEY` |
| Optional, with defaults | `STORAGE_BRAIN_URL` (the SDK's production URL), `COMPILE_WORKERS` (2), `COMPILE_TIMEOUT_MS` (10000), `COMPILE_MAX_QUEUE` (32) |

`entrypoint.sh` refuses to start without the Coolify variables, trades the
Universal Auth pair for a short-lived token, and runs `migrate` then `serve` under
`infisical run`. The service refuses to start without its required variables.

`STORAGE_BRAIN_API_KEY` is a key of the service's own Storage Brain tenant
(`lumitra-mail` for prod, `lumitra-mail-dev` for dev), minted by Storage Brain's
admin API and written into Infisical through a pipe, so the value is never
printed. The
Postgres (`ifq2uzzun0xg97wmx2ubq23a`) and DNS live in `infra/deployments/lumitra-mail`.

`MAIL_SECRETS_KEY`, `MAIL_UNSUBSCRIBE_KEY` and `DASHBOARD_SERVICE_TOKEN` are 32
random bytes as 64 hex characters, minted with the secrets proxy's
`copy_secret op=generate`, separately per environment. The dashboard (S3) receives its copy of the token with
`copy_secret op=copy`, never by hand.

## S2, sending: the foundation and who builds what

Phase S2 of the plan (providers, contacts, topics, suppressions, mailings, the
send worker, the hosted unsubscribe page and webhooks) is built by four teams in
parallel on one shared foundation, so none of them edits another's files.

### The foundation (shared, change only by agreement)

| File | What it is |
| --- | --- |
| `migrations/0003_sending.sql` | Every S2 table. Tenancy is enforced by composite foreign keys on `(workspace_id, id)`, so no row can point into another workspace. Secrets are stored sealed and a CHECK refuses plaintext. Suppressions are unique per `(workspace, email, topic)` with `NULLS NOT DISTINCT` (a NULL topic means every topic). |
| `src/repo/*.ts` | One repository per table, workspace id first. The only unscoped functions end in `ForWorker` and return ids plus workspace for the scoped calls that follow. |
| `src/transport/` | `Transport` (the provider seam) with its error contract: `TransientSendError` (retry), `PermanentSendError` (fail), `OutcomeUnknownSendError` (never retry, ends `skipped` with `outcome_unknown`). `createSmtpTransport` (Simple Mail Transfer Protocol, SMTP, through nodemailer, Transport Layer Security, TLS, always required) and `MemoryTransport` for tests (fail transiently, fail permanently, hang until `release()`, or crash after the provider accepted). |
| `src/budget.ts` | `Budget` and `ledgerBudget`: the rolling 24-hour recipient budget per provider over the `provider_sends` ledger. `reserve(tx, workspaceId, providerId, recipients)` locks the provider row, so concurrent workers cannot overspend, and answers `ok`, `exhausted` with `retryAfter`, or `exceeds_budget`. Every send counts, tests included. |
| `src/events.ts` | `emitEvent(tx, workspaceId, event)`: validates the contract's `WebhookEvent` envelope and writes it to the `webhook_events` outbox in the caller's transaction, with one pending delivery per subscribed endpoint. |
| `src/unsubscribe.ts` | `createUnsubscribeSigner(keys)`: signs and verifies the hosted-page token (HMAC-SHA256, a hash-based message authentication code, over workspace, contact, mailing and topic, in the contract's wire layout), keyed by `MAIL_UNSUBSCRIBE_KEY` (`Config.unsubscribeKeys`). |

Decisions baked into the foundation:

- **Mailing counts are computed, not stored.** `mailings.counts(workspaceId, id)`
  groups `mailing_recipients` by status on every read, so the numbers can never
  drift from the rows.
- **`mailings.template_id` has no foreign key.** It is provenance, and templates
  arrive in 0002 from another branch; the snapshot in `document` is what is sent.
- **Erasing a contact keeps its recipient and message rows with `contact_id`
  NULL** (the schema's `ON DELETE SET NULL`). The erasure route deletes what was
  sent to the person explicitly (`messages.deleteForContact`,
  `recipients.deleteForContact`) before deleting the contact, and keeps every
  suppression.
- **Providers are soft-deleted** (`deleted_at`): mailings and the archive keep
  pointing at them; `get` and `list` no longer show them.
- **The worker commits a claim before sending.** `recipients.claimNext` marks a
  row `sending` with `claimed_at`; a crash leaves it visible to
  `recipients.listStuckForWorker`, reconciled against
  `messages.latestForRecipient`.

### The four teams

| Team | Builds | Owns (new files) | Uses from the foundation |
| --- | --- | --- | --- |
| F1 | providers, topics, contacts and suppressions routes: `providers.*` (including `verify` through `createSmtpTransport` and `usage` through `ledgerBudget.usage`), `topics.*`, `contacts.*` (upsert, list, get, erase, messages), `suppressions.*` | `src/routes/providers.ts`, `src/routes/topics.ts`, `src/routes/contacts.ts`, `src/routes/suppressions.ts` and their tests | repos `providers`, `topics`, `contacts`, `suppressions`, `messages`, `recipients`; `Sealer`; `emitEvent` for `contact.unsubscribed` from the API |
| F2 | mailings, recipients, the test send and the worker: `mailings.*` with the state machine from `MAILING_TRANSITIONS`, `messages.*`, the claim loop, suppression and subscription checks at claim time, merge fields, List-Unsubscribe headers, retries with backoff, crash reconciliation, `min_interval_ms`, the Resend transport | `src/routes/mailings.ts`, `src/routes/messages.ts`, `src/worker/*`, `src/transport/resend.ts` and their tests | repos `mailings`, `recipients`, `messages`, `providers`, `providerSends`, `suppressions`, `contacts`; `Transport` and `MemoryTransport`; `ledgerBudget`; `emitEvent` for `message.sent`, `message.failed`, `mailing.finished`; the signer to build `{{unsubscribe_url}}` |
| F3 | the hosted unsubscribe page `/u/<token>`: GET shows the topics, POST applies (also the one-click target of RFC 8058, Request for Comments 8058), localised per workspace, writes the suppression, the audit row and the event in one transaction | `src/routes/unsubscribe.ts`, `src/pages/*` and their tests | `createUnsubscribeSigner`; repos `contacts`, `topics`, `suppressions`, `audit`; `emitEvent` for `contact.unsubscribed` |
| F4 | webhook delivery: `webhooks.*` routes (the secret is shown once, stored sealed), the delivery loop over `webhookDeliveries.claimDueForWorker`, signing with the contract's `v1=` scheme, retries on `WEBHOOK_RETRY_DELAYS_SECONDS` up to `WEBHOOK_MAX_ATTEMPTS`, redelivery | `src/routes/webhooks.ts`, `src/webhooks/*` and their tests | repos `webhookEndpoints`, `webhookEvents`, `webhookDeliveries`; `Sealer` |

Shared edits every team makes in its own lines: registering its routes in
`src/app.ts`, and starting its loop (F2, F4) in `src/main.ts`. The signer and the
transports are passed in through `createApp` options where a route needs them, the
way `secretsKeys` is today. A change to the migration or a repository signature
goes in a new migration file or a coordinated commit, never silently in a team's
branch.

## Webhooks (F4)

Endpoints are managed with `webhooks.*` (`src/routes/webhooks.ts`), all `admin` access. Events reach them through the outbox (`emitEvent`, `src/events.ts`) and the delivery loop (`src/webhooks/loop.ts`, started in `main.ts`, stopped on SIGTERM after the in-flight batch).

- **Secret.** `whsec_` plus 32 random bytes. Returned once, by `webhooks.create` and `webhooks.rotateSecret`; stored only sealed (`Sealer`); never in a get or list.
- **Signing.** Each request carries `x-mail-signature: v1=<hex>`, `x-mail-timestamp` and `x-mail-event-id`, from the contract's `signWebhook`. A receiver verifies with `verifyWebhook` over the raw body.
- **Rotation window.** `rotateSecret` keeps the old secret for 24 hours (`WEBHOOK_SECRET_ROTATION_WINDOW_MS`, migration 0007). Until then every request carries two comma-separated `v1=` signatures, so a receiver holding either secret verifies. After the window only the new secret signs.
- **Delivery.** A 2xx reply means delivered. A non-2xx reply, a timeout (10 seconds) or a network error retries on `WEBHOOK_RETRY_DELAYS_SECONDS` up to `WEBHOOK_MAX_ATTEMPTS`, then the delivery is `failed`. Redirects are never followed (a 3xx is a failed attempt). An endpoint disabled while a delivery is waiting is skipped without consuming an attempt, and resumes when re-enabled. `webhooks.redeliver` resets one delivery to pending, due now, and is audited as `webhook.redelivered`. The last status code, a response snippet (500 characters) and the duration are kept in `webhook_deliveries` for operators, not returned by the API.
- **Ordering and duplicates.** Order is not guaranteed and a delivery can repeat (a retry after a lost reply). **Receivers must deduplicate on the event id** (`id` in the body, `x-mail-event-id` in the headers).
- **Server-side request forgery (SSRF) guard.** Only `https` endpoints are accepted, and a hostname that resolves to a private, loopback or link-local address is refused, at create and update and again immediately before every send (so a DNS rebinding cannot slip through). Setting `WEBHOOK_ALLOW_INSECURE_TARGETS=true` lifts both, for local development only; never in production.
