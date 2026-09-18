---
title: Turn the email editor into a mail service with workspaces, and make ŌPUNTIA its first client
type: plan
status: in-progress
date: 2026-09-18
summary: Rebuild this repository's demo-complete platform as a real multi-tenant service (workspaces, API keys via auth-brain, a Postgres-backed API, a send worker with provider policies, suppression and preference topics, webhooks, a hosted unsubscribe page) with the visual editor embeddable through a published SDK. ŌPUNTIA's admin Studio is the first client and keeps its own people; the service keeps the mail.
tags: [saas, multi-tenant, mjml, smtp, resend, unsubscribe, webhooks, auth-brain, opuntia]
projects: [email-editor, opuntia-website]
---

# From editor to mail service

## Why

The client plan in `opuntia-website` (`docs/plans/2026-09-18-studio-email.md`)
needs a visual email builder, MJML (Mailjet Markup Language, compiled to
email-safe HTML) compilation, a resumable send queue with per-provider limits,
unsubscribe and suppression, a sent-mail archive, and later automations and
AI-assisted editing. None of that is specific to ŌPUNTIA. Built inside ŌPUNTIA it
is a copy that a second client would force us to extract; built here as a service
it is a Lumitra product from the first commit, with ŌPUNTIA as the design partner
that keeps it honest. Decided with Marlin on 2026-09-18.

## Where this repository really stands (2026-09-18)

The ROADMAP marks Phases 0 to 7 complete. Read precisely, that means the *UI and
the domain logic* exist, with 43 test files, but every persistence path runs on
mock adapters (`DatabaseAdapter` from `@marlinjai/data-table-core` with in-memory
demo data), API keys are parsed from their string format and counted in an
in-memory `Map` (`packages/core/src/api/validation.ts`), there is no login, no
tenancy enforcement, no worker, no webhook delivery, and nothing is published to
npm (every package at `0.0.1`). The deployment at `email-editor.lumitra.co` is the
Next.js example on Cloudflare Workers, a demo. Last commit 2026-06-07.

What is genuinely reusable and stays: the editor (`-core`, `-ui`, `-blocks`,
`-editor`), the MJML compiler, the template document schema, the merge-field
substitution, the automation engine's step model and condition evaluator, the
Resend send adapter, and the teams package's workspace, role and audit types.

## The boundary: clients keep the people, the service keeps the mail

This follows the split every provider has settled on. Transactional senders
(SendGrid's Mail Send API, Postmark, Amazon SES, Resend's send API) hold nothing
about recipients except the suppression list; marketing platforms (Mailchimp,
Brevo, Customer.io, Resend Audiences) hold a contact copy with an external id
while the client's own application stays the system of record. The service does
the second, minimally:

- **A contact** in the service is `(workspace, external_id, email, properties,
  topic subscriptions)`. The client upserts it and owns the truth about the
  person; consent records, relationship status and anything the client uses to
  *decide* whether to email someone never leave the client. The service only ever
  receives people the client has already filtered.
- **Suppression is owned by the service and enforced at send time**, whatever the
  client pushes. Bounces, complaints, unsubscribes and manual blocks, per
  workspace, separate from contacts (deleting a contact never lifts a
  suppression). This is the one rule the whole industry agrees on, because a
  client that forgets to check it burns the sending domain.
- **Preference topics** per workspace (for ŌPUNTIA: "Programme updates", "Venue
  outreach"), so an unsubscribe from one does not silently end the other, and a
  mailing is always sent under exactly one topic.
- **The sent archive** (subject, final HTML per recipient, provider message id,
  outcome) lives in the service and is mirrored to the client by webhook, so the
  client can show it next to its own records without calling the service on every
  page view.

Every table carries `workspace_id`, every query is scoped by it at the data
layer, and cross-workspace access is impossible by construction rather than by
convention.

## Identity and tenancy

- **Humans** sign in through auth-brain (`auth.lumitra.co`, OpenID Connect,
  OIDC). The service is a registered application there with its own appGrant,
  the same pattern ŌPUNTIA's Studio already uses, so a Studio user opening the
  service's dashboard is already signed in.
- **Clients** (the Opuntia admin, later any customer's backend) authenticate with
  a workspace API key: random, shown once, stored hashed, scoped to one workspace,
  revocable. The existing `ek_{tier}_{random}` format and in-memory tier counting
  are replaced by rows in Postgres.
- **A workspace** is the tenant: members with roles (owner, admin, editor,
  viewer, from the teams package), API keys, providers, topics, templates,
  contacts, mailings, suppressions, webhooks, audit log.

## Service shape

**Hosting.** A long-running Node service on Coolify (Hetzner, like the other
Lumitra services), with its own Postgres, secrets in Infisical, scaffolded with
the `scaffold-project` skill. Not Cloudflare Workers: the send worker needs a
process that keeps running, SMTP connections and timers. Domain to decide
(`mail.lumitra.co` is the natural one; the product name and the packages' role
suffixes follow the package-naming standard, never `lumitra` as a slug).

**Data model** (all rows carry `workspace_id`):

- `workspaces`, `workspace_members`, `api_keys` (hash, prefix, last used,
  revoked_at), `audit_log`.
- `providers`: one per workspace and channel, `kind` `smtp` | `resend`, config
  with the secret stored encrypted at rest under a service key held in Infisical,
  written through the piped source-to-sink pattern and never displayed again;
  `policy` (see below); `from_name`, `from_email`, `reply_to`.
- `topics`: slug, name, description shown on the preference page.
- `templates`: `document JSONB` (the editor's schema, with `schema_version`),
  name, thumbnail, versions.
- `contacts`: `external_id`, `email` (lowercased, unique per workspace),
  `properties JSONB`, `topic_subscriptions`, `created_at`, `updated_at`.
- `suppressions`: `email` (unique per workspace), `reason` `unsubscribed` |
  `bounced` | `complained` | `manual`, `topic_id` (NULL = all topics),
  `source_message_id`, `created_at`.
- `mailings`: subject, `document` snapshot, compiled `mjml` and `html`,
  `topic_id`, `provider_id`, status (`draft` | `scheduled` | `sending` |
  `paused` | `sent` | `partially_failed` | `cancelled`), counts, timestamps.
- `mailing_recipients`: `contact_id`, `email`, `merge JSONB`, status (`queued` |
  `sending` | `sent` | `failed` | `skipped`), `skip_reason`, `attempts`,
  `message_id`, unique on `(mailing_id, email)`.
- `messages`: the archive, one row per delivered or failed message, with final
  HTML, provider message id, outcome, error, `recipient_count`.
- `webhook_endpoints` and `webhook_deliveries` (event, payload, attempts,
  signed with a per-endpoint secret, retried with backoff).

**Provider policies.** A provider row carries the limits the worker enforces:
`daily_recipient_budget`, `min_interval_ms`, `max_recipients_per_message` (always
1 for broadcasts). The iCloud+ SMTP policy is encoded from Apple's published
limits (1,000 messages and recipients a day, 500 per message, [Apple
Support](https://support.apple.com/en-us/102198)): default budget 800 a day,
3,000 ms between messages, one recipient per message. The Resend policy is the
account's plan limits. The budget counts recipients (To plus CC plus BCC) over a
rolling 24 hours per provider, including transactional sends the client routes
through the same provider.

**The worker.** One process per service instance, started at boot, claims one
recipient at a time with `FOR UPDATE SKIP LOCKED`, checks suppression and topic
subscription at claim time (so a person who unsubscribed after the mailing was
queued is skipped), substitutes merge fields into the compiled HTML with every
value HTML-escaped, adds `List-Unsubscribe` and `List-Unsubscribe-Post` headers
(one-click unsubscribe, Request for Comments (RFC) 8058), sends through the
provider, and writes the message row and the recipient's final status in one
transaction. A row stuck in `sending` after a crash is reconciled against
`messages`; if no row exists it is marked `failed` with "outcome unknown" for a
human to decide, never retried automatically, because a duplicate cannot be
unsent. Transient provider errors retry three times with backoff; permanent
rejections mark the recipient failed. Pause, resume, cancel and retry-failed are
state changes on the mailing that the worker honours.

**Unsubscribe and preferences.** A hosted page at `<service>/u/<token>` per
workspace (later per custom domain), the token an HMAC (hash-based message
authentication code, a keyed signature) over `(workspace, contact, mailing,
topic)`. GET shows the topics and a confirm button; POST applies, so link
scanners never unsubscribe anyone. `List-Unsubscribe-Post` targets the same POST.
Every change writes a suppression, an audit row and a webhook event. The page is
localisable per workspace (ŌPUNTIA needs five languages).

**Webhooks to the client.** Events `message.sent`, `message.failed`,
`contact.unsubscribed`, `contact.bounced`, `mailing.finished`, signed with a
per-endpoint secret (HMAC over the body, timestamp in the header), retried with
backoff, visible with their delivery status in the dashboard.

**API (v1, JSON, workspace key in the `Authorization` header).**

- `POST /v1/contacts` upsert by `external_id` or `email`; `DELETE /v1/contacts/:id`
  (erasure: contact, recipients and archived HTML for that person, keeps the
  suppression, since forgetting a block would mean emailing someone who asked us
  not to); `GET /v1/contacts/:id/messages`.
- `GET|POST|PUT /v1/templates`, `POST /v1/templates/:id/compile` (returns mjml,
  html, warnings, errors), `POST /v1/compile` for an inline document.
- `POST /v1/mailings`, `POST /v1/mailings/:id/recipients` (batch, idempotent on
  email), `POST /v1/mailings/:id/test` (to one named address, marked as test),
  `POST /v1/mailings/:id/send|pause|resume|cancel|retry-failed`,
  `GET /v1/mailings/:id` with live counts.
- `GET|POST|DELETE /v1/suppressions`; `GET /v1/topics`.
- `GET|POST /v1/webhooks`.
- Errors are typed and documented; every mutating call is idempotent with an
  `Idempotency-Key`.

**The SDK.** `@marlinjai/mail-sdk` (typed client for the API above, Node and
edge) and the editor packages (`@marlinjai/email-editor` and its three
dependencies) published at `0.1.0` via GitHub Actions Trusted Publishing (the
OpenID Connect setup proven on email-mcp). The editor gains an `onRequestImage`
hook (the host supplies an image URL from its own picker or uploader) and a
`migrateTemplate` entry point (identity for schema 1.0), so hosts that persist
documents can upgrade them later. The private `@email-editor/shared` package must
not remain a runtime dependency of anything published.

**The dashboard.** The existing Phase 7 dashboard, rewired from mock adapters to
the API: workspace settings (members, API keys, providers, topics, webhooks),
templates with the editor, mailings with live progress and controls, the sent
archive with a sandboxed HTML preview, suppressions. Everything a client can do by
API a human can do here.

**Images.** Uploaded through the dashboard or the SDK hook to Storage Brain and
served through a stable service URL (`<service>/a/<id>`), never a signed URL
directly in an email, since signed URLs expire while the email is still in an
inbox.

**Tracking.** Open and click tracking exist in the analytics package and stay
available per workspace, off by default. ŌPUNTIA keeps it off: its privacy policy
promises no tracking.

## The marketing platform, not only an API

The service is the product for two kinds of customer, and the boundary above
serves both:

- **A client with its own application** (ŌPUNTIA today) keeps its people and
  pushes recipients per mailing. The service is its mail infrastructure.
- **A customer with no application** (the typical newsletter or small-business
  sender) manages people inside the service: import a CSV, tag them, collect
  signups through a hosted form or an embed with double opt-in, build segments
  (saved filters over contacts, tags, properties and engagement), and send
  broadcasts to a segment. For them the service is the whole marketing platform.

Same contact table, same topics, same suppression, same worker and archive.
Segments are the service-side counterpart of a client's audience resolution, and
a client with an application may use them too. Everything a marketing platform is
expected to carry (scheduling, A/B testing of subject and content, campaign
analytics with open and click tracking opt-in per workspace, automations, billing)
is in scope for the service; the repository already holds first versions of all of
it over mock adapters, and the phases below sequence them behind the parts ŌPUNTIA
needs first.

## Service architecture (decided 2026-09-18, binding for every phase)

Written once so the phases built in parallel cannot drift apart:

- **Layout.** The service is `apps/service` (`@email-editor/service`, private), the
  dashboard `apps/dashboard` (`@email-editor/dashboard`, private). `apps/*` joins
  `pnpm-workspace.yaml`. The v1 API contract (TypeScript types and zod schemas for
  every request, response, error and webhook payload) is `packages/mail-contract`
  (`@marlinjai/mail-contract`, published), and the typed client is
  `packages/mail-sdk` (`@marlinjai/mail-sdk`, published). The service, the SDK and
  the dashboard all import the contract, never their own copies of the shapes.
- **Runtime.** Node 22, Hono on `@hono/node-server`, zod validation at the edge
  of every route, JSON errors of the shape `{ error: { code, message, details? } }`
  with the codes enumerated in the contract.
- **Database.** Postgres 17 through `postgres` (porsager, as in auth-brain's app
  package). Ordered, additive SQL files in `apps/service/migrations/NNNN_name.sql`
  tracked in a `_migrations` table, applied by an explicit `migrate` command (the
  container runs it before the server starts, never on build). Every
  workspace-owned query goes through a repository function that takes
  `workspaceId` as its first argument; there is no unscoped query helper.
- **API keys.** `@marlinjai/brain-core` (`generateApiKey`, `hashApiKey`,
  `verifyApiKey`, `timingSafeEqual`), shown once, stored as a hash with a display
  prefix, `last_used_at` and `revoked_at`. The old `ek_{tier}_{random}` in-memory
  counting in `packages/core/src/api/validation.ts` is retired.
- **Humans.** The dashboard signs people in with `@marlinjai/auth-brain-nextjs`
  (the pattern ŌPUNTIA's Studio uses) and calls the service server-side with a
  dashboard service token plus the signed-in user's auth-brain subject; the service
  checks that subject's workspace membership and role on every call. The browser
  never holds a workspace API key.
- **Secrets.** Infisical project for the service; the provider-credential
  encryption key (`MAIL_SECRETS_KEY`, AES-256-GCM, versioned so it can rotate) is
  minted with `copy_secret op=generate`, never typed.
- **Tests.** vitest; integration suites on `@testcontainers/postgresql` (on this
  machine run with `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`, or they
  skip silently); an in-process SMTP transport stub for the worker; the four paths
  of the stateful-flow standard for every flow with state.
- **CI.** GitHub Actions: typecheck, unit, integration against a Postgres service
  container, build, and `roadmap-check`. Packages publish through Trusted
  Publishing (OpenID Connect) from a tag workflow.

## Phases

- **S0, foundation.** Name and domain decided; Coolify app, Postgres, Infisical
  project, auth-brain application and appGrant; workspaces, members, API keys,
  audit log; CI with the roadmap check.
- **S1, editor and templates.** Templates and compile API; the editor packages
  updated for React 19 and Next 16, given the image hook and migration entry
  point, published; the SDK published. ŌPUNTIA can compose and preview.
  Reality (2026-09-18, editor half, branch `feat/editor-packages-0.1`): the
  four editor packages are at `0.1.0` and publishable (checked on the packed
  tarballs in CI by `scripts/check-packed-manifests.mjs`); `onRequestImage` and
  `migrateTemplate` exist; the prebuilt stylesheet is scoped under `.ee-root`
  and verified in a Next 16, React 19, Tailwind CSS 4 host (`examples/nextjs`);
  `publish.yml` publishes on a tag `editor-v*` (and the mail contract and SDK on `mail-v*`). The document's schema
  field is `version` (today `"1.0"`); the service's `schema_version` column
  stores that value. Not yet published: waits on the npm steps in question 4
  below.
- **S2, sending.** Providers with encrypted secrets and policies; contacts, topics,
  suppressions; mailings, recipients, the worker, the unsubscribe page, webhooks.
  ŌPUNTIA can send. Tested on all four paths of a stateful flow (forward,
  backtrack and revise, resume after a crash and after the daily budget, re-entry
  after completion or failure), with a transport stub in CI and one real
  end-to-end send before the first real broadcast.
- **S3, dashboard.** The human UI over the same API.
- **S4, the platform features.** Contacts managed in the service: CSV import, tags,
  custom properties, hosted signup form and embed with double opt-in; segments;
  scheduling and A/B testing on mailings; campaign analytics with open and click
  tracking opt-in per workspace (rewiring the analytics package). ŌPUNTIA does not
  need any of this to send, so it follows S3.
- **S5, billing.** Plans and limits per workspace (Stripe, the pattern from
  Lumitra QR), usage metering on the worker, the free tier the API-key code already
  sketches. ŌPUNTIA stays a design partner outside billing.
- **Later, in their own plans:** automations (the existing engine detached from the
  contacts and campaigns packages behind `ContactSource` and `Sender` interfaces,
  plus a visual flow canvas over the existing step schema), AI-assisted editing (a
  prompt beside the canvas, the model returns a document in the same schema,
  applied as a reviewed diff), custom domains per workspace.

## Progress

### S0, foundation (built 2026-09-18, branch `feat/s0-foundation`)

Built and verified:

- **Service** `apps/service` (`@email-editor/service`): Hono on Node 22, Postgres 17,
  migration `0001_foundation` (workspaces, workspace_members, api_keys, audit_log,
  idempotency_keys), the explicit `migrate` command, repositories that take
  `workspaceId` first, API-key and dashboard authentication, the shared
  `Idempotency-Key` middleware (stored responses sealed with AES-256-GCM under
  `MAIL_SECRETS_KEY`, since one of them carries a freshly minted key), the typed
  error envelope. Routes and the role table
  are in `apps/service/README.md`.
- **Tests**: 27 unit, 69 integration on Testcontainers Postgres 17 (tenancy proven on
  every route, revoked keys, the last-owner rule including a concurrent race,
  idempotency on all four stateful-flow paths, migrations from empty, after a failed
  file, and under two concurrent runners). CI runs them against a Postgres service
  container, builds the arm64 image, and runs `roadmap-check`.
- **Infrastructure** (marlinjai/infra#37, applied): Infisical project "Lumitra Mail"
  (`f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4`) with the app machine identity; Coolify
  project, `postgres:17-alpine` and the `mail.lumitra.co` A record; GitHub deploy
  secrets through Terraform; the Coolify application `c60ld4gx620wemkvvj9l9p51`
  pulling `ghcr.io/marlinjai/email-editor-service`. `MAIL_SECRETS_KEY` and
  `DASHBOARD_SERVICE_TOKEN` minted per environment with `copy_secret op=generate`.
- **auth-brain** (marlinjai/auth-brain#141, merged and deployed): the `mail`
  app-grant, hidden until the dashboard ships, granted to Lumitra and ŌPUNTIA.

Defaults taken in S0 (each can be overturned later):

1. **One source of shapes.** The service imports `@marlinjai/mail-contract`
   (`workspace:*`): request and response schemas, error codes, header names and
   the route table. Every operation is registered from `routes[id]`, and a
   conformance suite parses every S0 response with the contract's schemas.
2. **Members are added by auth-brain subject** (`members.add`: `subject`, `email`,
   `name`, `role`), not invited by email. The service never sees a login, so an
   email-only invite would need a pending-invite model and an accept step; the
   dashboard resolves the person first. Creating a workspace takes the owner's
   email in the body, since the service does not ask auth-brain who a subject is.
3. **Permissions** are the contract's access levels (`read`: viewer or any key;
   `write`: editor or a send or full key; `admin`: admin or a full key;
   `dashboard`: a person before any workspace). Beyond the table: only an owner,
   signed in, grants or removes the owner role, and anyone may leave.
4. **Idempotency** is opt-in per request, stores every response below 500 sealed, keeps
   keys 24 hours, and clears a claim left `in_progress` for more than 5 minutes.
5. **The auth-brain app slug is `mail`**, hidden until S3. Granted on 2026-09-18
   through the machine API to the Lumitra (`lumitra-core`) and ŌPUNTIA (`opuntia`)
   companies, and read back.
6. **Image** `ghcr.io/marlinjai/email-editor-service`, deployed by
   `.github/workflows/deploy-service.yml` on pushes to `main` that touch the service.
   `/healthz` reports the served commit, and the deploy waits until every reply
   carries it.
7. **The in-memory `ek_` key counting in `packages/core/src/api/validation.ts` stayed**
   through S0 (retired in S1, see below): nothing published depends on it, but the deployed demo's compile route
   (`examples/nextjs/app/api/compile/route.ts`) does, and S1's compile API is what
   replaces that route. It is retired together with the demo route in S1.

Inputs for later phases, found while building S0:

- **Erasure** (auth-brain's `tenant.erased` webhook) needs each workspace keyed to
  an auth-brain company. S3 adds that column when the dashboard creates workspaces
  for a signed-in company, and subscribes the `mail` app to erasure then.

### S1, templates, compile and assets (built 2026-09-18, branch `feat/s1-templates`)

Built and verified (details in `apps/service/README.md`, section "Templates,
compile and assets"):

- **Migration `0002_templates_assets`**: `templates` (document `jsonb`,
  `schema_version`, name, description, thumbnail, current `version`, archive),
  `template_versions` (one immutable row per saved version, append-only enforced
  by a trigger) and `assets` (the Storage Brain file id, the sniffed type, size,
  dimensions, SHA-256).
- **Templates CRUD and versions** exactly per the contract's route table. Every
  stored or compiled document passes the editor core's `migrateTemplate` first.
  Saves are optimistically locked on `base_version` (409 `conflict` with the
  current version; the row is locked, so of two racing saves exactly one wins);
  an unchanged save keeps the version.
- **Compile** (`templates.compile`, `compile`): always 200 with `{ mjml, html,
  warnings, errors }`, MJML messages without server paths. MJML runs in a pool of
  worker threads with a per-job deadline (the worker is terminated and replaced)
  and a bounded queue (503 when full). A test holds `/healthz` answering during a
  multi-second compile.
- **Assets**: multipart upload, content-sniffed (PNG, JPEG, GIF, WebP), 10 MB,
  stored in Storage Brain, served at `https://mail.lumitra.co/a/<id>` by streaming
  through a fresh five-minute signed URL per request, with the stored type,
  `Cache-Control: public, max-age=31536000, immutable` and an `ETag`.
- **Retired**: `packages/core/src/api/` (the `ek_` key parsing, in-memory usage
  counting, tiers and watermark) and its `export * from './api'` in
  `@marlinjai/email-editor-core/server`. `examples/nextjs`'s compile route now
  validates with `migrateTemplate` and compiles with no key handling, and the
  demo's export surfaces a failed compile instead of swallowing it.
- **Secrets and config**: `STORAGE_BRAIN_API_KEY` in Infisical "Lumitra Mail"
  dev and prod, each from its own new Storage Brain tenant (`lumitra-mail-dev`,
  `lumitra-mail`), minted by the Storage Brain admin API inside the secrets
  proxy and stored by its capture mechanism, never printed; `PUBLIC_BASE_URL`
  (`https://mail.lumitra.co` in prod, `http://localhost:3000` in dev). Both are
  required at boot.
- **Tests**: 220 in the service (unit and integration on Testcontainers Postgres
  17): tenancy on every S1 route, the version conflict and the race, invalid and
  newer-version documents, compile with and without errors, the event loop under
  a heavy compile, compile timeout, queue overflow and worker crash, upload
  sniffing and limits, the public URL's headers, 304, 404 and 503, idempotent
  upload retries, the Storage Brain adapter against a local stand-in, and the
  four stateful-flow paths of template editing (forward; backtrack and revise;
  resume after a restart; re-entry by restoring an old version as a new one).

Defaults taken in S1 (each can be overturned later):

1. **Restoring a version is a save**, not its own route: the client saves the old
   version's document on the current `base_version`, which appends a new version
   and never rewrites history. The contract needed no extension for it.
2. **A rejected document is `validation_failed`** with the editor core's reason in
   `details.reason` (`NEWER_VERSION` carries `details.document_version`), rather
   than a new error code: the contract's envelope already carries it.
3. **Every real change bumps the version**, a rename or an archive too, since the
   version is the lock token; each version row snapshots the document.
4. **A compile past its deadline** (`COMPILE_TIMEOUT_MS`, 10 s) answers 200 with
   the timeout in `errors`, as the contract answers every readable compile;
   only a full queue is an error (503, retryable).
5. **Assets stream through the service** rather than redirect, so the type and
   the caching are the service's, the Storage Brain URL never reaches a mail
   client, and a 304 costs no Storage Brain call.
6. **One Storage Brain tenant per environment**, not a key shared with another
   app: quota, listing and erasure stay the mail service's own.
7. **The contract gained one audit action**, `asset.uploaded`.
### S2, F2: mailings and the send worker (built 2026-09-18, branch `feat/s2-mailings-worker`)

Mailings with the contract's state machine, the recipient batch, test sends, the
messages archive, the send worker and the Resend transport. Decisions taken on the
stated defaults, open to change:

- **A crash mid-send ends `skipped` with `outcome_unknown`,** as the contract and
  the schema say (the worker paragraph above says "marked `failed`"; the contract
  wins). "Re-sent once" holds for every failure before the provider took the
  message: a transient refusal, or a crash before the claim committed.
- **An address the recipient batch creates is subscribed to the mailing's topic**
  (the client adding it to a topic mailing is the consent). An existing contact's
  subscriptions are never changed, and suppressions always win at claim time.
- **The mailto of `List-Unsubscribe` goes to the provider's reply address** (else
  its from address): a person reads it. The service has no inbound mail.
- **`mailings.duplicate`** (`POST /v1/mailings/:id/duplicate`) was added to the
  contract and the SDK: any mailing, in any state, copied into a new draft
  without recipients.
- **Compiling** goes through S1's compile pool and document validation, the same
  path as the compile API.

### S3, the dashboard (built 2026-09-18, branch `feat/s3-dashboard`)

Built and verified (details in `apps/dashboard/README.md`):

- **`apps/dashboard`** (`@email-editor/dashboard`, private): Next.js 16, React 19,
  Tailwind CSS 4, dark only in the Lumitra black and brushed gold. Sign-in is
  auth-brain OpenID Connect (OIDC) with the `mail` app grant and a required second
  factor, the ŌPUNTIA Studio's pattern (popup landing, silent sign-in, `/no-access`).
  Every call to the service goes through the SDK's dashboard client in server
  components and server actions; the browser never holds the service token or a key.
- **Screens**: workspace switcher and creation; settings (general with languages and
  the tracking choice, members with roles and invitations, API keys shown once and
  revoked, providers with a write-only secret, verify and usage against the daily
  budget, topics with translations, webhooks with the secret shown once, deliveries
  and redelivery); templates with the editor (conflict handling on `base_version`,
  history and restore, a sandboxed compile preview, image upload through the assets
  API via `onRequestImage`); mailings (compose from a template, provider and topic,
  recipients pasted or from a CSV with the service's added, already present and
  rejected counts, test send, send with a preflight, live counts, pause, resume,
  cancel, retry failed, duplicate); the sent archive with a sandboxed preview;
  suppressions; contacts with their messages and erasure; the audit log.
- **Company erasure**: migration `0008_workspace_company` (`workspaces.company_id`,
  the `erasure_events` ledger) and `POST /internal/erasure` on the service, which
  verifies auth-brain's `x-lumitra-erasure-signature`, deletes the company's images in
  Storage Brain and every workspace row in one transaction, idempotent by event id.
  `MAIL_ERASURE_WEBHOOK_SECRET` is minted into both Infisical projects.
- **Infrastructure** (marlinjai/infra#41, applied): the Coolify application
  `e6fm7v8mv1nfaj3jg5w4n5ib` pulling `ghcr.io/marlinjai/email-editor-dashboard`, the
  `app.mail.lumitra.co` A record (not proxied), the `COOLIFY_WEBHOOK_DASHBOARD` GitHub
  secret. Infisical "Lumitra Mail" `/dashboard` (prod and dev) holds the dashboard's
  secrets; the OIDC client "Lumitra Mail dashboard" is registered in auth-brain.
  auth-brain#142 (draft) shows the `mail` card, points it at the dashboard and
  subscribes the service to `tenant.erased`; it merges only after this phase deploys.
- **Tests**: vitest for the server actions (mocked SDK) and the helpers; Playwright end
  to end against the real service and send worker on Postgres 17, an SMTP sink and a
  Storage Brain stand-in, covering the mailing flow on all four paths of the
  stateful-flow standard, and a production guard proving the test sign-in cannot be
  enabled in production. CI runs all of it (`verify.yml`, job `dashboard`), and builds
  the image.

Defaults taken in S3 (each can be overturned later):

1. **Members join by invitation, a resource of the service** (decided with the
   orchestrator 2026-09-18, replacing a first stateless signed link, which could not
   be revoked or listed): migration `0009_workspace_invites` and the routes
   `invites.create`, `invites.list`, `invites.revoke`, `invites.accept`. The token is
   shown once and stored as a SHA-256; an invitation is single use, revocable and
   expires (7 days by default, at most 30). Accepting needs the signed-in auth-brain
   address to match the invited one, the invitation to be pending, and the inviter
   to still be a member able to grant the role; accepting while already a member is
   a no-op success. Only a person signed in can invite (an API key cannot), since
   acceptance re-checks the inviter. Audited as `member.invited`, `invite.revoked`
   and `member.added`. Nothing is emailed: the admin sends the link. Tested on the
   four paths (accept; revoke first; expiry, then a new invitation; a second
   acceptance, and a return after leaving).
2. **`company_id` is nullable and optional on create**: workspaces created before S3,
   or by a path with no company, carry none, and no company erasure reaches them. The
   dashboard always sends the signed-in person's company (their choice when they have
   several with the grant).
3. **The erasure endpoint is on the service** (`/internal/erasure`, outside `/v1`),
   not the dashboard, since the service holds the data. It acknowledges `user.erased`
   and unknown companies as no-ops (auth-brain waits for every subscribed app); only
   `tenant.erased` is subscribed.
4. **A mailing's content is a snapshot**: editing the template never changes it; the
   mailing screen offers "Use its current version" while the mailing is a draft.
5. **The last test result is read from the archive** (the newest test message of the
   mailing) and marked out of date when the mailing changed after it, so it survives a
   reload and needs no state of its own.
6. **The end-to-end suite runs `next dev`**: only a non-production process honours
   the test sign-in, which is the property the production guard proves.
7. **Times are shown in Europe/Berlin** for now; per-person time zones wait for a
   profile setting.
8. **A restart mid-send in the end-to-end suite is graceful (SIGTERM)**, as a deploy
   does; a hard crash leaves a row `sending` that the worker settles only after its
   15-minute stuck window, which the service's own sending-flow suite covers.

### S4, the platform features (built 2026-09-18, branch `feat/s4-platform`)

The service side of the marketing platform: tags, typed contact properties,
segments, the CSV import, hosted signup forms with double opt-in, scheduling, A/B
tests, and open and click tracking with campaign analytics. The dashboard screens
for them follow S3 (the dashboard, built in parallel). Details in
`apps/service/README.md`, section "S4, the platform features". Migrations 0010
to 0013 (0008 and 0009 are the dashboard's).

**Contract extensions** (the typed S4 namespace was incomplete for these flows):
the import became upload, mapping with a dry run, and commit
(`imports.setMapping`, `imports.commit` naming the `mapping_version` it saw,
`imports.cancel`, `imports.rows`, a richer `ImportJob`); `segments.preview`;
`contactProperties.delete`; signup forms gained `title`, `consent_text`,
`translations`, `provider_id` and `version`, plus `signupForms.get` and
`signupForms.embed`, and a submission carries a signed `form_token`;
`mailings.unschedule` and rescheduling (`schedule` from `scheduled`); A/B tests
with `winner_metric: manual`, their state on `Mailing.ab_test`,
`mailings.clearAbTest` and `mailings.pickAbWinner`; `tracking.get`; the error
code `tracking_disabled`; `Contact.tags`; the webhook events `contact.subscribed`,
`import.finished`, `mailing.scheduled`, `mailing.started`,
`mailing.schedule_failed` and `mailing.ab_winner_selected`; and the S4 audit
actions. The SDK gained the matching methods.

Defaults taken (each can be overturned later):

1. **Tracking is off by default and stays off for ŌPUNTIA.** `tracking.update`
   holds opens and clicks separately and keeps `settings.tracking_enabled` equal
   to `opens || clicks`; that flag stays the master switch. A mailing snapshots
   its tracking when it starts. After tracking is turned off, opens are refused,
   and clicks on links already sent still reach their destination without being
   recorded, so no recipient's link breaks.
2. **Only flags are stored for tracking events**, never the address or user
   agent. A machine event is a known scanner or prefetcher, no user agent, or a
   click within 5 seconds of delivery; Apple Mail Privacy Protection is a bare
   `Mozilla/5.0` or an address in 17.0.0.0/8, counted apart and never as a human
   open. Engagement segments and A/B metrics count human events only.
3. **The S4 tokens derive their keys from `MAIL_UNSUBSCRIBE_KEY`**, one key per
   purpose, so no new secret had to be provisioned.
4. **Scheduling validates at schedule time** everything `send` checks, and a
   mailing edited into one that cannot start goes back to `draft` at its time
   with `mailing.schedule_failed`; a passing problem leaves it scheduled. A
   schedule lies in the future and within a year. `send_at` in the past while no
   process ran is released on the next start.
5. **A/B cohorts**: the test group is `test_fraction` of the queued recipients,
   at least one per variant, split round-robin in an order hashed from row ids;
   the rest is held until the winner is known, so a mailing with a manual test
   stays `sending` until someone picks. Ties go to the earlier key. A metric test
   whose tracking was turned off after the start waits for a manual pick.
6. **Typed properties**: a definition checks later writes (and is refused while
   existing values break it); keys without a definition stay free-form as in S2.
   Text filters compare case-insensitively; a missing value never matches.
7. **Tag assignment ignores unknown ids** rather than failing the batch, so
   nothing is disclosed about ids of other workspaces.
8. **The import** stores the parsed file row by row in Postgres (50 MB, 200,000
   rows at most), commits in batches of 500, never changes a contact's email or
   lifts a suppression, adds topics and tags but never removes them, and treats
   an address blocked for every topic (any reason) as `suppressed`. With
   `update_existing: false` it only fills missing fields. The first row with an
   address wins over later duplicates. Five failed batches in a row end it
   `failed`. Each new subscription gets a consent record naming who confirmed
   consent.
9. **`mailings.addSegment`** queues only matching contacts subscribed to the
   mailing's topic; suppressions are still checked at send time.

10. **Signup forms**: the time trap accepts a form token 3 seconds to 24 hours
    old, and a post without one gets the form back to confirm once more; rate
    limits are 5 submissions per client address per 10 minutes and 300 per
    workspace per hour, in Postgres; the client address is `cf-connecting-ip`,
    else the first `x-forwarded-for`, else the socket. Every accepted-looking
    submission gets the same answer (202 for the JSON route). A confirmation
    link lasts 72 hours; the same address resubmitted supersedes its earlier
    link. Confirming lifts only `unsubscribed` blocks, narrowing an all-topics
    block to the topics not on the form, and records `contact.resubscribed`
    with the new source `signup_form`. The
    confirmation mail is transactional: no List-Unsubscribe, no `message.*`
    webhook, counted against the provider's budget, and resent if a worker died
    while sending it (a duplicate confirmation is harmless, a lost one blocks
    the person). Settled submissions are purged after 30 days; erasing a
    contact deletes its submissions at once. A confirmation template is
    compiled when the form is saved, so a later template edit reaches the form
    on its next save.

11. **S5's plan limits on the S4 paths** (S4 merged after S5): `setAbTest` and
    the start of a mailing with an A/B test need the plan's `ab_testing`;
    turning tracking on needs `tracking`, and a mailing started on a plan
    without it is sent untracked whatever the settings say; the start of every
    mailing, scheduled ones included, checks the period's message budget (a
    scheduled mailing over it goes back to `draft` with
    `mailing.schedule_failed`); the contacts a CSV import batch or a signup
    confirmation adds must fit the plan's contact limit. Over it, the import
    stops `failed` at that batch (earlier batches stay imported) and the
    confirmation rolls back with a localised "not possible right now" page, its
    link still valid for when there is room.

12. **`mailings.duplicate` copies the A/B test definition** (decided by the
    orchestrator, 2026-09-18): variants, test fraction, winner metric and wait
    come along; the winner, the decision time and all results are reset, so
    the copy is a fresh draft whose test is `pending`. The plan and tracking
    checks run again when the copy starts.

Also fixed on the way: a transient retry's due time was stamped with the app
host's clock and compared with the database's, so a few milliseconds of skew
delayed a zero-delay retry (sending-flow's retry test flaked on main); it is now
stamped on the database clock, and so is a click's age.

### S5, billing, service side (built 2026-09-18, branch `feat/s5-billing`)

Built and verified (details in `apps/service/README.md`, section "Billing (S5)"):

- **Migration `0015_billing`**: `workspace_billing` (one row per workspace,
  backfilled and created by a trigger on insert: plan, status, the Stripe
  customer and subscription it mirrors, the period, `billing_exempt`), and
  `stripe_events` (one row per applied Stripe event), plus an index on the send
  ledger per workspace for metering.
- **Routes** `billing.plans`, `billing.subscription`, `billing.usage`,
  `billing.checkout` and the new `billing.portal`, all through `mount()` from the
  contract; the Stripe webhook at `POST /stripe/webhook`, outside `/v1`.
- **Enforcement** of the plan's limits on `mailings.send` (the whole audience or
  nothing), `mailings.test`, contact creation (upsert and recipient batches),
  `members.add`, `providers.create`, `webhooks.create`, and turning tracking on;
  a soft warning at 80 percent in `billing.usage` and the
  `x-mail-usage-warning` header.
- **Reconciliation**: a loop in `serve` and every stale read of
  `billing.subscription` re-read the subscription from Stripe.
- **The operator command** `main.js billing-exempt <workspace> on|off "<reason>"`,
  the only writer of `billing_exempt`.
- **One setup command**: `apps/service/scripts/stripe-setup.mjs`, run as a
  single `execute_with_secrets` call (README, "Stripe setup: one command"),
  creates the catalogue, the portal configuration and the webhook endpoint and
  stores every id and the webhook secret in Infisical dev and prod through the
  proxy's captures; nothing secret is printed.
- **Tests**: 33 billing integration tests, 4 for the setup script, over a stateful Stripe stand-in at the
  fetch level (so the real client runs), 5 against stripe-mock (in CI as a
  service container), 17 unit tests. The four paths of the subscription
  lifecycle: forward (checkout, payment, webhook); backtrack and revise (up to
  growth and down again in the portal, events out of order, a downgrade below
  the current member count); resume (a missed webhook healed by the read, by the
  loop and after a restart; Stripe unreachable on a read); re-entry (dunning,
  cancel at period end, cancel, subscribe again, a late event of the old
  subscription).

Defaults taken in S5 (each can be overturned later):

1. **Plans and prices**: free (EUR 0; 1,000 messages a month, 500 contacts, 2
   members, 1 provider, 1 webhook endpoint), starter (EUR 9; 10,000, 5,000, 5,
   2, 3; tracking), growth (EUR 29; 50,000, 25,000, 20, 5, 10; tracking and A/B
   tests). Monthly only, EUR, final prices under paragraph 19 UStG as for
   Lumitra QR. Custom domains are in no sold plan yet (a later phase). These are
   Marlin's to change: the limits in `src/billing/plans.ts`, the amounts there
   and in `scripts/stripe-setup.mjs`.
2. **"Messages a month" counts recipients handed to a provider**, from the send
   ledger (`provider_sends`), test sends included, per Stripe period (paid) or
   calendar month in UTC (free, exempt). The contract's metric name stays
   `messages`.
3. **No usage is reported to Stripe.** The plans are flat prices with hard
   limits, so there is nothing to meter there; metered billing returns only
   with an overage price, which is a pricing decision.
4. **The limit is decided at `mailings.send` for the whole audience**, counting
   what started mailings still hold; the worker never checks it, and pause,
   resume and retry-failed are never refused, so an accepted mailing always
   finishes. A downgrade deletes nothing: new rows are refused until the counts
   fit.
5. **Plan changes go through the Stripe customer portal**: checkout starts a
   subscription only, and answers `conflict` for a workspace that has one. The
   portal configuration (from the catalogue script) allows switching between the
   two Prices with proration and cancelling at the period's end.
6. **The webhook re-reads the subscription from Stripe** rather than trusting the
   event payload (Lumitra QR reads the payload), so out-of-order and duplicate
   deliveries converge; an event is applied exactly once through
   `stripe_events`. The product tag is `mail` on the customer, the session and
   the subscription.
7. **Status mapping**: `past_due` and `unpaid` keep the paid plan while Stripe
   retries; `canceled` drops to free with status `cancelled`; `paused` to free.
8. **The exemption is an operator command**, not an HTTP route: the service has
   no operator role, and a command run where `migrate` runs needs the database
   itself, which no API key, member or Stripe event has. Lifting it drops to
   free and lets reconciliation restore a paid plan.
9. **Stripe is optional at boot.** Without a key or a Price id, plans, usage and
   limits still work; checkout, the portal and the webhook fail closed (503).
10. **Test-mode Stripe waits on a key.** No Infisical project holds a Stripe
    test key (Lumitra QR and Ultra Power hold only the live one), so
    `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are `PLACEHOLDER_REPLACE_ME`
    in "Lumitra Mail" dev and prod, and the test catalogue and endpoint are not
    created yet; the live key was deliberately not copied. Once Marlin puts the
    test key in both, one command does the rest (ROADMAP.md).
12. **Production runs in Stripe test mode until launch**, with the test
    endpoint at `https://mail.lumitra.co/stripe/webhook`, so the whole flow can
    be tried on the real deployment without real money; going live replaces
    the key and reruns the setup with `--live`.
11. **The suites of earlier phases seed design-partner workspaces**, so they stay
    about their own features; the billing suites seed free ones.

### First-client findings: document ids and the asset policy (built 2026-09-18, #28)

ŌPUNTIA, the first client, found two gaps; #28 (merged as `62cf0c1`) closed both:

- **Documents without an `id`.** The editor store required one, while the
  contract and the core schema did not. The store now assigns a stable id when
  it opens an id-less document; the service stores documents exactly as sent.
- **Remote assets.** A per-workspace `settings.asset_policy` (`any`, the
  default, or `service_only`) makes every image, stylesheet or font address off
  the service's host a compile error, so such a mail cannot be sent, and
  `assets.import` copies a remote image into the asset store over `https`
  behind the webhooks' server-side request forgery (SSRF) guard, which #28 also
  hardened (IPv4-mapped IPv6 in hex form, the 100.64.0.0/10 range).
- **Done 2026-09-18:** ŌPUNTIA's workspace (`9402caff-1afc-4875-b849-63a9dda9b35e`)
  was switched to `asset_policy: service_only` after the deploy; its only
  template (the base template) compiles without errors under it.

## Legal shape

The service is a data processor for each workspace's controller. It ships with a
processing-agreement template (Art. 28 of the General Data Protection Regulation,
GDPR) that lists what it stores (email, name and properties the client sends,
sent HTML, suppression reasons, provider message ids), for how long (configurable
retention on the archive, suppressions kept until the controller deletes them),
sub-processors (Hetzner, the workspace's own mail provider, Storage Brain), and
the erasure and export endpoints. ŌPUNTIA's agreement, currently being drafted in
the business-plan repository, names this service explicitly.

## Questions settled by default (2026-09-18)

Marlin approved the plan on 2026-09-18 and asked for implementation to proceed on
stated defaults where an answer is still outstanding. Each is an assumption that a
later decision can overturn:

1. **Product name and domain:** "Lumitra Mail" at `mail.lumitra.co`. The package
   slug stays product-based (`@marlinjai/mail-sdk`), never `lumitra`.
2. **Repository:** not renamed. The service lives beside the editor packages in
   `marlinjai/email-editor` as `apps/service` (API, worker, hosted pages).
3. **Archive retention:** keep until the controller deletes. Suppressions are kept
   until the controller deletes them, and erasure of a contact never lifts one.
4. **npm Trusted Publishing:** the GitHub Actions workflow is prepared; each
   package still has to be registered as a trusted publisher on npmjs.com by
   Marlin before the first publish succeeds (a 404 on the upload means it is not
   registered yet). Until then hosts consume the packages from the workspace.
   That is six registrations on npmjs.com, each with repository
   `marlinjai/email-editor` and workflow file `publish.yml`, in two release
   sets (`scripts/release-sets.mjs`): the editor set
   (`@marlinjai/email-editor-core`, `-blocks`, `-ui`, `@marlinjai/email-editor`,
   tag `editor-v*`) and the mail set (`@marlinjai/mail-contract`,
   `@marlinjai/mail-sdk`, tag `mail-v*`). None of them exists on npm yet
   (checked 2026-09-18), and npm only lets a trusted publisher be attached to
   an existing package, so the very first publish is manual and Marlin's:
   after `npm login`, run `scripts/first-publish.sh` from a clean checkout of
   main (try `scripts/first-publish.sh --dry-run` first). It builds, tests and
   packs all six, publishes the checked tarballs in dependency order, asks for
   the one-time password once if npm wants one, skips anything already
   published (so it is safe to re-run), and ends by printing, per package,
   the npmjs.com link and the exact trusted-publisher settings to enter
   (GitHub Actions, `marlinjai` / `email-editor`, workflow `publish.yml`, no
   environment), followed by the two tag commands (`editor-v0.1.0`,
   `mail-v0.1.0`). The workflow skips versions already on the registry, so
   those first tags only prove the registration works, and every later tag
   publishes through OpenID Connect with provenance.
5. **Contract details the plan left open** (fixed in `@marlinjai/mail-contract`,
   2026-09-18): a recipient whose outcome is unknown after a crash ends `skipped`
   with `skip_reason` `outcome_unknown` rather than `failed`, so `retry-failed`
   never touches it unless called with `include_outcome_unknown: true`; API keys
   carry a scope (`full`, `send`, `read`) that maps with member roles onto each
   route's access level; a mailing carries up to 20 string `metadata` values that
   every message webhook echoes (how ŌPUNTIA learns `sent_by`); webhook signatures
   are `v1=<hex>` over `${timestamp}.${rawBody}` with a 300 second tolerance.
6. **`@marlinjai/mail-sdk`** (`packages/mail-sdk`, 0.1.0) is the typed client built
   in this phase: it needs the same npm Trusted Publishing registration as
   `@marlinjai/mail-contract` before its first publish succeeds. Add it to the same
   npmjs.com trusted-publisher setup Marlin does for the other packages under item 4.
7. **S2 providers and topics, contract gaps** (settled with the orchestrator,
   2026-09-18): a provider's `policy` stays required on create, so there is no
   default per kind; a provider on `smtp.mail.me.com` is refused
   (`validation_failed`, pointing at `ICLOUD_SMTP_POLICY`) above Apple's limits of
   1,000 recipients a day and one recipient per message. The route table has no
   `topics.delete`: the schema already refuses to delete a topic a mailing uses,
   and the route waits for a client that needs it (ROADMAP.md). `providers.verify`
   answers `{ ok: false, error }` with `error` starting with a stable code
   (`auth_failed`, `tls_failed`, `host_unreachable`, `no_secret`,
   `provider_rejected`); for Resend it reads `GET /domains` and counts a key
   restricted to sending as valid.
