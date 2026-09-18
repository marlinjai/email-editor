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
| `write` | editor | send or full | `templates.create`, `templates.update`, `templates.delete`, `assets.upload`, `assets.import` |
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

A document's `id` is optional (the contract's `TemplateDocument` and the core
schema agree). The service stores a document exactly as sent: without an id it
is saved, compiled and sent without one, and an id is kept verbatim; an id that
is not a string is `validation_failed` at `document.id`. The editor assigns an
id when it opens an id-less document and emits it from then on, so the first
save after opening such a document adds the id and bumps the version once;
later saves of the same document keep the version.

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

**Importing a remote image.** `POST /v1/assets/import` with `{ url, filename? }`
copies an image from the web into the workspace and answers with the same
`Asset` as an upload (`asset.imported` in the audit log, with the source
address). The fetch runs from the service's network, so it carries the
webhooks' server-side request forgery (SSRF) guard (`src/assets/remote.ts`):
`http` and `https` only, no credentials in the address, and no private,
loopback or link-local target, checked before the request and again inside
the socket's own DNS lookup on the addresses it then connects to (a name that
changes its answer in between cannot slip through). A redirect is refused,
never followed. The size limit is checked on `Content-Length` and while
reading; the deadline is 10 seconds. The remote `Content-Type` is ignored: the
bytes are sniffed exactly as an upload's. Blocked addresses, redirects and a
remote 4xx are `invalid_request` (with `details.status`); a network failure, a
timeout or a remote 5xx is `provider_error` with `details.service =
"asset_import"`. `WEBHOOK_ALLOW_INSECURE_TARGETS=true` lifts the private-target
check here too, for local development only.

**Asset policy.** `settings.asset_policy` decides where a workspace's mails may
load images, stylesheets and fonts from: `any` (the default) or
`service_only`, the service's own host (`PUBLIC_BASE_URL`), where `/a/<id>`
serves uploads and imports. Every compile goes through
`src/compile/workspace-compile.ts`: under `service_only` MJML's automatic
Google Fonts imports are left out (the font falls back to its stack), and
`src/compile/asset-policy.ts` walks the compiled HTML and reports every other
address as a compile error, so `compile` (the editor's preview),
`templates.compile`, `mailings.test`, `mailings.send` and `mailings.schedule`
(`compile_failed`), a scheduled release (back to draft with
`mailing.schedule_failed`), A/B variants and a signup form's confirmation
template refuse the same documents. It reads `src`, `srcset`, `poster`, `background`
and `data` on any element (Outlook's `<v:fill src>` included, inside
conditional comments), `href` on `<link>`, `<base>` and SVG images, and every
`url()`, `@import` and `image-set()` in a `style` attribute or a `<style>`
element (so `@font-face`). It fails closed: a relative or protocol-relative
address, another scheme, or one built from a merge field is an error; `data:`
and `cid:` pass; links (`<a href>`) are not loads and are not checked. A test
send of a mailing's stored snapshot is held to the policy as it is now. A
mailing already accepted for sending finishes with its snapshot. Workspaces
written before the setting existed read as `any` (`withSettingDefaults`, on
every read, so no backfill migration). A change is audited in
`workspace.updated` with `asset_policy: { from, to }`. To switch a workspace,
an admin calls `PATCH /v1/workspace` with `{ "settings": { "asset_policy":
"service_only" } }`; before that, compile its templates under the new policy
(or look for remote image hosts and `metadata.fonts`) and import what is
remote, since every such document stops being sendable at once.

## Layout

- `src/main.ts`: the commands `migrate`, `serve` and the operator's `billing-exempt`.
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
| Optional, billing (S5) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_ID`, `STRIPE_PRICE_GROWTH_ID`, `STRIPE_PORTAL_CONFIGURATION_ID`. Unset or `PLACEHOLDER_REPLACE_ME` means not configured: plans, usage and limits still apply, checkout, the portal and `/stripe/webhook` answer 503 |

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

### The hosted unsubscribe page (F3)

`GET /u/<token>` shows a person's topics and changes nothing; `POST /u/<token>`
applies a choice, and a body of exactly `List-Unsubscribe=One-Click` is the
one-click target of RFC 8058 (Request for Comments 8058). Every change writes the
suppression, its audit row and a `contact.unsubscribed` or `contact.resubscribed`
event in one transaction (`src/routes/unsubscribe.ts`, whose header comment holds
the rules). The HTML comes from `src/pages/render.ts`, the copy in five languages
from `src/pages/i18n.ts`. It is public, lives outside `/v1` and the contract's
route table, and is mounted only when `createApp` receives `unsubscribeSigner`
(`main.ts` always passes it). A test send's link carries
`contact_id: TEST_UNSUBSCRIBE_CONTACT_ID` and opens a preview that never writes.
Migration `0006_contact_resubscribed.sql` adds the resubscribe event type.

### Mailings and the send worker (F2)

- `src/routes/mailings.ts`: the state machine of `MAILING_TRANSITIONS`, every
  action under the mailing's row lock. Content and recipients change only in
  `draft` or `scheduled`; `send` compiles the stored document (the snapshot),
  refuses a broadcast without `{{unsubscribe_url}}` and hands it to the worker.
- `src/worker/loop.ts` (`SendWorker`): one loop per process, started by `serve`,
  stopped on SIGTERM after the send in flight is recorded. Per cycle, one
  transaction claims the next recipient, checks suppression, erasure and topic
  subscription, waits out `min_interval_ms` and reserves the daily budget under
  the provider's lock (a "not yet" rolls back: the recipient stays queued, no
  attempt counts). The send happens after that commits; the archived message, the
  recipient's final status and the webhook event then commit together.
  Transient failures retry three times (30 s, 2 min, 10 min); a row left
  `sending` for 15 minutes is reconciled from the archive.
- `src/worker/merge.ts`, `compose.ts`: merge fields (every value HTML-escaped),
  the preheader, and `List-Unsubscribe` with `List-Unsubscribe-Post` (RFC 8058).
- `src/worker/test-send.ts`: one test message, counted against the budget,
  archived with `is_test`; its unsubscribe token names contact `test`.
- `src/transport/resend.ts`: Resend over HTTP, with an idempotency key derived
  from the message, so a retry after a timeout is never delivered twice.

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
- **Server-side request forgery (SSRF) guard.** Only `https` endpoints are accepted, and a hostname that resolves to a private, loopback or link-local address is refused, at create and update and again immediately before every send (so a DNS rebinding cannot slip through). Setting `WEBHOOK_ALLOW_INSECURE_TARGETS=true` lifts both, for local development only; never in production. Refused ranges: IPv4 loopback, private (RFC 1918, Request for Comments 1918), link-local, the shared address space 100.64.0.0/10 (carrier-grade network address translation, and the Tailscale network the service's hosts share), benchmarking, multicast and reserved; IPv6 loopback, unspecified, link-local, site-local, unique local and multicast, and every IPv4 address embedded in IPv6 (mapped, in the dotted or the hex form the URL parser produces, compatible, and NAT64) judged as the IPv4 address it carries. The same policy guards `assets.import`.
### F1: providers, topics, contacts and suppressions

- **Providers.** The password or API key is taken on create and update, sealed
  with `MAIL_SECRETS_KEY`, and never returned (`has_secret` instead), audited
  (`provider.updated` records the changed field names and `secret_rotated`) or
  logged. `verify` connects through `createSmtpTransport` (or reads Resend's
  `GET /domains`) with a 10 second limit (`providerVerifyTimeoutMs`) and answers
  `{ ok, error }`, `error` starting with `auth_failed`, `tls_failed`,
  `host_unreachable`, `no_secret` or `provider_rejected`. On `smtp.mail.me.com`
  a policy above Apple's limits is refused. Deleting is soft, and refused
  (`conflict`) while a mailing that uses the provider is scheduled, sending or
  paused (`mailings.countActiveForProvider`).
- **Topics.** The slug is unique per workspace (`already_exists`). No delete
  route yet; the schema refuses to delete a topic a mailing uses.
- **Contacts.** Upsert finds by `external_id`, else by `email` (trimmed and
  lowercased). An external id and an email that name two contacts, or an email
  whose contact carries another external id, is a `conflict`, never a merge.
  `topics` replaces the subscriptions but skips every topic the address
  unsubscribed from. Erasure deletes the archived messages, the recipient rows
  and the contact in one transaction, keeps every suppression, and audits the
  counts without the address.
- **Suppressions.** Adding one is idempotent per address and topic; a new
  `unsubscribed` block unsubscribes the contact and emits `contact.unsubscribed`
  (source `api` or `dashboard`) in the same transaction. Lifting needs `admin`.
- Tests: `test/integration/providers.test.ts` verifies against a real in-process
  SMTP server (`smtp-server`, self-signed TLS, so that one file sets
  `NODE_TLS_REJECT_UNAUTHORIZED=0`); `test/integration/contacts.test.ts` covers the
  upsert matrix, erasure and the contact lifecycle on the four paths.

## S4, the platform features

Phase S4 turns the service into a marketing platform for customers without an
application of their own: contacts managed in the service (tags, typed
properties, CSV import, hosted signup forms with double opt-in), segments,
scheduling and A/B tests on mailings, and campaign analytics with open and click
tracking, opt-in per workspace and **off by default**. Every route is mounted from
the contract's `platformRoutes`; the hosted pages (`/f/...`, `/t/...`) live outside
`/v1` like `/u/`. Migrations `0010` (tags, properties, consent records,
segments, the new event types), `0011` (imports), `0012` (signup forms) and `0013`
(scheduling, A/B, tracking).

**The platform worker** (`src/platform/worker.ts`, started in `main.ts`, stopped on
SIGTERM) runs the S4 background jobs listed in `src/platform/jobs.ts`: releasing
scheduled mailings, deciding A/B tests, the import dry runs and commits, and the
signup confirmation mails. Each job keeps its state in Postgres and does one unit
of work per transaction under a row lock (`FOR UPDATE SKIP LOCKED`), so a crash
loses nothing and several processes can run it. Jobs take the loop's clock as
`now`, which the tests drive instead of sleeping.

**Tokens** for the S4 endpoints (form render time, confirmation link, open pixel,
click link) and the address hashes come from `src/platform/tokens.ts`: one key per
purpose, derived from `MAIL_UNSUBSCRIBE_KEY`, so no new secret is needed and a
token minted for one purpose never verifies for another.

### Tags and typed properties

- `tags.*`: a tag's `contact_count` is counted on read; `Contact.tags` lists the
  slugs. Assigning ignores ids that name no contact of the workspace (so nothing
  is disclosed about other ids); audit rows carry counts, never addresses.
- `contactProperties.*`: defining a key makes every later write of it
  type-checked (`string`, `number`, `boolean`, `date` as ISO 8601; `null` removes
  a value). A definition that stored values already break is `conflict` with up
  to five example contact ids. Definitions and contact writes serialise on a
  per-workspace advisory lock, so a wrong type cannot slip in between. Keys
  without a definition stay free-form, as in S2.

### Segments

`segments.*`, `segments.preview` and `mailings.addSegment`. The filter tree
(`and`, `or`, `not` over conditions, at most `MAX_FILTER_DEPTH` deep) is compiled
by `src/segments/compile.ts` into one parameterised SQL fragment: field names
come from a fixed switch, and every value and every property key is a bound
parameter, never string-built (the injection battery in
`test/integration/segments.test.ts` runs hostile values and keys against the
database and checks the tables afterwards). Each field accepts the operators of
the contract's `FILTER_FIELD_OPERATORS`. Text compares case-insensitively,
`contains` and `starts_with` match `%`, `_` and backslashes literally, and a
missing value never matches (and so matches under `not`). A defined property is
compared by its type; an undefined one by JSON equality, text for
`contains`/`starts_with`, and numbers only for number values. Engagement fields
(`engagement:opened|clicked`, "within N days") need tracking on
(`tracking_disabled` otherwise) and never count machine events or Apple Mail
Privacy Protection opens. `mailings.addSegment` queues, in one statement, every
matching contact subscribed to the mailing's topic.

### CSV import

A resumable job in four steps: `imports.create` (upload: parsed per RFC 4180,
comma or semicolon, UTF-8, every row stored, answering the columns, a sample and
a suggested mapping that knows English and German headers), `imports.setMapping`
(starts a dry run in the worker; a revision discards the previous one and bumps
`mapping_version`), `imports.commit` with the `mapping_version` the caller saw
(anything else is `conflict`), and `imports.cancel`. The commit writes batches of
500 rows, each batch and its row outcomes in one transaction, so a crash resumes
at the first unwritten row and never applies a row twice. Every row ends
`created`, `updated`, `unchanged`, `suppressed` or `skipped` with a reason
(`imports.rows`); importing the same file again gives only `unchanged`. An
address blocked for every topic is `suppressed` and nothing is written; a block
on some topics withholds just those. An import never lifts a suppression and
never changes a contact's email. Each new subscription gets a consent record
naming who confirmed consent and when. Five failed batches in a row end the
import `failed`. `import.finished` reports the end.

### Signup forms with double opt-in

`signupForms.*` manage a form: its topics and tags, the provider the
confirmation goes through, the consent text (with translations), a version
bumped on every change, and optionally a template for the confirmation mail,
compiled when the form is saved and required to contain `{{confirm_url}}`.
Deleting is soft: pending links then show "no longer available".

- **Hosted page and embed.** `/f/<id>` is the form in the five languages of the
  hosted pages (`src/pages/signup-i18n.ts`), chosen by `?lang` or the browser's
  languages among the workspace's. `signupForms.embed` gives a no-JavaScript
  HTML form posting to the hosted page, and the optional `/f/<id>/embed.js`,
  which fetches a fresh token from `/f/<id>/token`. The JSON
  `signupForms.submit` is the one public `/v1` route (the authentication
  middleware skips routes the contract marks public) and answers CORS only for
  the form's `allowed_origins`.
- **Bot protection.** A honeypot field; a time trap (the signed `form_token` must
  be 3 seconds to 24 hours old; a post without a valid one, like the static
  embed's, gets the form back prefilled with a fresh token and one more button);
  and fixed-window rate limits in Postgres, 5 per client address per 10 minutes
  and 300 per workspace per hour, so they hold across restarts and instances.
  Every accepted-looking submission gets the same answer, so the form never
  discloses whether an address is known.
- **Double opt-in.** Nothing is subscribed and no contact is created until the
  person confirms. The confirmation mail goes out from an outbox the platform
  worker drains through the form's provider (counted against its daily budget,
  honouring `min_interval_ms`, archived, retried on transient failures). The link
  `/f/confirm/<token>` lasts 72 hours; GET only shows a button (link scanners
  confirm nobody), POST confirms. A resubmission of the same address supersedes
  its earlier link; a different address has its own. Confirming twice is a
  no-op, an expired link says so and points back to the form, and an address
  already subscribed to every topic gets no mail at all.
- **What confirming writes**, in one transaction: the contact (names and locale
  only where empty), the subscriptions and tags, one consent record per topic
  (the consent text as shown, the form version, keyed hashes of the submitting
  and confirming addresses, both timestamps), the audit row and
  `contact.subscribed`. A suppressed address can opt in again only this way: an
  `unsubscribed` block on the form's topics is lifted (an all-topics block becomes
  per-topic blocks on every topic not on the form), with `contact.resubscribed`
  for each; bounced, complained and manual blocks are never lifted.
- Erasing a contact deletes its signup submissions too, pending links included,
  and its consent records go with the contact.

### Scheduling

`mailings.schedule` (from `draft`, or again from `scheduled` to move it) runs
the checks `send` runs, now, and accepts a time in the future and within a year;
`mailings.unschedule` returns it to `draft`; `send` and `cancel` work as before.
The schedule job releases a due mailing through the same start as `send`
(`src/platform/start-mailing.ts`), with trigger `schedule`; state lives in the
mailing row, so a restart releases whatever came due meanwhile on its first tick.
A mailing edited while scheduled into one that cannot start goes back to `draft`
at its time with `mailing.schedule_failed` and an audit row; a passing problem
(the compile pool full) leaves it scheduled for the next tick. Every start emits
`mailing.started`.

### A/B tests

`mailings.setAbTest` (while editable), `clearAbTest`, `pickAbWinner`. When sending
starts, the queued recipients are ordered by a hash of their row id; the first
`test_fraction` (at least one per variant) go round-robin to the variants, the
rest are **held** (never claimed, and the mailing cannot finish while they wait).
A variant replaces the subject, the document or both. `opens` and `clicks` tests
need that tracking on (`tracking_disabled`, which says to use `manual`); after
`decide_after_minutes` the variant with the most unique human opens or clicks
wins (a tie to the earlier key) and the held recipients get it. If the metric
stopped being tracked meanwhile, the test waits for a person (`awaiting_pick`).
`pickAbWinner` decides any running test by hand, once. Both emit
`mailing.ab_winner_selected`. `mailings.duplicate` copies the base content
only, never the A/B test.

### Plan limits (S5)

A/B tests and tracking are plan features (`plan_limit_reached` without them; a
mailing started on a plan without tracking goes out untracked). Every start,
scheduled or not, checks the period's message budget. The contacts an import
batch or a signup confirmation adds must fit the plan's contact limit: the
import then stops `failed` at that batch, and the confirmation rolls back with
a "not possible right now" page whose link keeps working.

### Tracking and analytics

Off by default. `tracking.update` sets opens and clicks and keeps the workspace's
`settings.tracking_enabled` equal to `opens || clicks`; that flag stays the master
switch (off through `workspace.update`, nothing is tracked). A mailing snapshots
what is tracked when it starts (`MailingAnalytics.tracking`). With tracking off
the worker adds no pixel and rewrites no link, and a token for such a mailing is
refused; ŌPUNTIA's workspace stays off, and `test/integration/mailing-platform.test.ts`
proves the HTML is untouched and nothing is recorded.

With tracking on, `/t/o/<token>` answers a 1x1 GIF and `/t/c/<token>` a 302 to
the link's stored destination. The token binds workspace, mailing, recipient
and the link's number; the destination comes from `mailing_links`, never from
the request, so it is not an open redirect. Links with a merge field (the
unsubscribe link, personalised links) are never rewritten. Only flags are
stored, never the address or the user agent: known scanners and prefetchers,
and clicks within 5 seconds of delivery, are machine events; a bare
`Mozilla/5.0` or an address in Apple's 17.0.0.0/8 is Apple Mail Privacy
Protection, counted apart (`apple_mpp_opens`) and never as a human open. HEAD
requests are never recorded. After tracking is turned off, opens are refused
and clicks still lead to their destination without being recorded, so a
recipient's link never breaks. `mailings.analytics` aggregates per mailing and
per variant; unsubscribes come from the `contact.unsubscribed` events naming
the mailing, bounces and complaints from suppressions whose source message
belongs to it.

## Billing (S5)

Plans, limits and Stripe, on the shared Lumitra Stripe account and the pattern
of Lumitra QR. Code: `src/billing/*`, `src/routes/billing.ts`,
`src/routes/stripe-webhook.ts`, migration `0015_billing.sql`.

**Plans** (`src/billing/plans.ts`; limits and features are the service's own,
what a plan costs is the Stripe Price its id points to):

| Plan | Per month | Messages a month | Contacts | Members | Providers | Webhook endpoints | Features |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `free` | EUR 0 | 1,000 | 500 | 2 | 1 | 1 | none |
| `starter` | EUR 9 | 10,000 | 5,000 | 5 | 2 | 3 | tracking |
| `growth` | EUR 29 | 50,000 | 25,000 | 20 | 5 | 10 | tracking, A/B tests |
| `design_partner` | not sold | unlimited | unlimited | unlimited | unlimited | unlimited | all |

**Metering.** Usage is computed on every read, never stored. `messages` is the
sum of the send ledger (`provider_sends`: every recipient handed to a provider,
test sends included) in the period: the Stripe period for a paid plan, the
calendar month in UTC otherwise. The other metrics are counts. Nothing is
reported to Stripe: the plans are flat monthly prices with hard limits, so there
is nothing to meter there (it would come back only with an overage price).

**Enforcement** answers `plan_limit_reached` (429, not retryable) with
`details.metric` or `details.feature`, `used` and `limit`:

- `mailings.send`: the whole audience must fit what is left of the period after
  what was sent and what started mailings still hold. A mailing runs whole or
  not at all; once accepted it always finishes (the worker never checks a
  limit, and `pause`, `resume` and `retry-failed` are not checked), so a limit
  never cuts an audience in half. `mailings.test` is one more recipient.
- Contacts (`contacts.upsert` and a recipient batch that creates contacts),
  `members.add`, `providers.create`, `webhooks.create`: checked after the
  insert in the same transaction, under the workspace's billing row lock, so a
  no-op upsert never counts and two racing inserts cannot both slip through.
  A refused batch rolls back whole. A downgrade removes nothing: new rows are
  refused until the count fits.
- Turning `settings.tracking_enabled` on needs a plan with `tracking`. S4's A/B
  tests call `assertFeature(tx, workspaceId, 'ab_testing')` from
  `src/billing/usage.ts`, and its imports and signup forms
  `assertWithinLimit(tx, workspaceId, 'contacts')`.
- Soft warning: at 80 percent of any limit `billing.usage` lists it in
  `warnings`, and `mailings.send` and `mailings.test` answer with
  `x-mail-usage-warning: messages=8200/10000`.

**Checkout and the portal.** `billing.checkout` creates the workspace's Stripe
customer on first use (tagged `metadata.product=mail` and the workspace id, so
reconciliation can always find its subscriptions) and a Checkout Session on the
plan's configured Price, with the tag and the workspace on the session and on
`subscription_data`. It fails closed: without a Stripe key or the plan's Price
id it answers 503 before anything is written or sent. A workspace that already
has a subscription changes or cancels its plan in the Stripe customer portal
(`billing.portal`); checkout answers `conflict` then. Stripe failures are
`provider_error` (502) with `details.service = "stripe"`.

**The webhook** `POST /stripe/webhook` (public, outside `/v1` and the contract,
its own 512 KB body limit):

1. Without `STRIPE_WEBHOOK_SECRET` or `STRIPE_SECRET_KEY`: 503, so Stripe keeps
   the event and retries.
2. `Stripe-Signature` is verified over the raw body (HMAC-SHA256, 300 second
   tolerance, constant-time); a bad one is 400.
3. The product gate: an event tagged for another product on the shared account
   is acknowledged and dropped (only its type and id are logged); an untagged
   one is ours only if its customer or subscription is one this service
   recorded.
4. The workspace is the one the recorded Stripe ids point to; a metadata
   workspace id that disagrees is not believed (logged, recorded as
   `unknown_workspace`).
5. The subscription is re-read from Stripe and its current state mirrored onto
   `workspace_billing`, so events out of order or twice converge on Stripe's
   state; a late `deleted` of a replaced subscription never ends its successor.
6. Exactly once: the event id is inserted into `stripe_events` in the same
   transaction as the change; a replay changes nothing, a failure (Stripe
   unreachable, a Price no plan is configured with) answers 500 and records
   nothing, so Stripe's retry applies it.

Status mapping: `active`, `trialing` keep the Price's plan; `past_due` and
`unpaid` keep it while Stripe retries the payment; `canceled` and
`incomplete_expired` drop to `free` with status `cancelled`; `paused` to `free`
with `past_due`; `incomplete` changes nothing yet.

**Reconciliation.** `serve` runs a loop (every 15 minutes, and at start) that
re-reads the subscription of every workspace whose mirror is older than an
hour, and `billing.subscription` does the same for its workspace on read. A
lost webhook therefore heals within the hour, or at once when someone looks.
Stripe being unreachable on a read serves the stored mirror and logs.

**The design-partner exemption** (`billing_exempt`, plan `design_partner`, no
limits, no checkout, no portal) is set only by the operator command, never by
an API key, a member or a Stripe event; the schema refuses the plan without the
flag and the flag without the plan:

```bash
# inside the service container (Coolify: the app's terminal), or locally with DATABASE_URL:
node dist/main.js billing-exempt <workspace id or slug> on "<who decided, why>"
node dist/main.js billing-exempt <workspace id or slug> off "<why>"
```

It writes a `billing.exemption_changed` audit row. Lifting it drops the
workspace to `free` and marks the mirror stale, so the next read or
reconciliation restores any plan it still pays for. An exempt workspace that
still has a subscription keeps being charged by Stripe: cancel that in Stripe.

**Stripe setup: one command.** `scripts/stripe-setup.mjs` does the whole
setup on the shared account in one run: the two Products and their monthly
Prices (lookup keys `mail-starter-monthly`, `mail-growth-monthly`), a portal
configuration that switches between them or cancels at the period's end, and
the webhook endpoint `https://mail.lumitra.co/stripe/webhook` for exactly
`STRIPE_WEBHOOK_EVENTS`, pinned to the API version. It writes the three ids and
the endpoint's `whsec_` secret only to the secrets proxy's capture directory,
never to stdout. It is idempotent (a re-run creates nothing and captures the
same ids; an existing endpoint's secret cannot be read back, so none is
captured unless `--recreate` replaces the endpoint), refuses a live key
without `--live`, and stops on a Price that exists with another amount.

Once the shared account's `sk_test_` key is in Infisical "Lumitra Mail" dev and
prod, the one command is a single `execute_with_secrets` call:

- `projectId` `f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4`, `env` `dev`, `workingDir` `/tmp`;
- `command`: `node --input-type=module - <<'EOF_STRIPE_SETUP'`, then the file's
  content, then `EOF_STRIPE_SETUP` (the proxy host runs Node 22);
- `captures`: `STRIPE_PRICE_STARTER_ID`, `STRIPE_PRICE_GROWTH_ID`,
  `STRIPE_PORTAL_CONFIGURATION_ID` and `STRIPE_WEBHOOK_SECRET`, each with two
  destinations (the project, envs `dev` and `production`, path `/`, same key);
  `STRIPE_WEBHOOK_SECRET` with `overwrite: true` (it replaces the
  placeholder) and `required: false` (a re-run that keeps the endpoint writes
  none).

Captures are stored only when the command exits 0, so a failed run changes
nothing in Infisical; run it again. Then redeploy. Until launch, production
runs in Stripe test mode, which lets the whole flow be tried on the real
deployment without real money. Going live (Marlin's decision) repeats the
command with the live key in prod, `--live` appended to the `node` line, and
destinations in `production` only.

**Tests.** `test/integration/billing.test.ts` drives the real Stripe client
against a stateful fake at the fetch level (`test/support/fake-stripe.ts`):
signature, replay and racing replays, foreign products, forged workspaces,
Stripe outages, the four paths of the subscription lifecycle (subscribe;
change up and down, out of order; resume after a missed webhook, through the
read, the loop and a restart; cancel and subscribe again, with dunning and a
late event), limits with the mid-mailing rule, the free tier, the exemption and
tenancy. `test/integration/stripe-mock.test.ts` runs the same client against
stripe-mock (Stripe's own mock, which validates every request against Stripe's
API description): `STRIPE_MOCK_URL` in CI, Testcontainers locally.
`test/integration/stripe-setup.test.ts` runs the setup script exactly as the
proxy does (the file on stdin, a capture directory) against stripe-mock and
against a stateful fake: every request valid, a re-run creating nothing,
`--recreate` rotating the secret, and every refusal made before any request. The suites
of earlier phases seed design-partner workspaces
(`seedWorkspace(slug, { billing: 'free' })` opts into the free plan).

