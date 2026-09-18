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
5. **Contract details the plan left open** (fixed in `@marlinjai/mail-contract`,
   2026-09-18): a recipient whose outcome is unknown after a crash ends `skipped`
   with `skip_reason` `outcome_unknown` rather than `failed`, so `retry-failed`
   never touches it unless called with `include_outcome_unknown: true`; API keys
   carry a scope (`full`, `send`, `read`) that maps with member roles onto each
   route's access level; a mailing carries up to 20 string `metadata` values that
   every message webhook echoes (how ŌPUNTIA learns `sent_by`); webhook signatures
   are `v1=<hex>` over `${timestamp}.${rawBody}` with a 300 second tolerance.
