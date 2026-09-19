# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `importMjml` in `@marlinjai/email-editor-core/server`: reads an MJML document
  into the editor's document model. Nothing is dropped silently: what cannot
  become an editable block is kept as compiled HTML, with a warning carrying its
  path and source; unreadable MJML is an `MjmlImportError` with a line and
  column; `mj-include` is refused. The editor's own export imports back exactly.
- Documents keep MJML attributes the editor has no control for
  (`extraAttributes` on blocks, columns and sections) and an imported document's
  head settings (`metadata.mjmlHead`); the compiler emits them.
- Mail service: `templates.importPreview`, `templates.import` (idempotent, with
  an optional copy of remote images into the workspace's assets),
  `templates.export` and `mailings.export` (MJML or HTML files, never refused;
  send-blocking problems in `x-mail-export-warnings`), and the `invalid_mjml`
  error. The contract and the SDK carry all four.
- Dashboard: "Import MJML" (paste or upload, preview, warnings, remote images,
  create) and an Export menu (MJML or HTML) for templates and mailings.
- Landing page: the editor line names MJML import and export, in all five
  languages.

### Fixed

- The editor dropped every `padding` object when it opened a document, and its
  own padding edits never reached the compiled mail.
- The compiler wrote only the padding sides that were set, so `{ top, bottom }`
  was read by MJML as vertical and horizontal padding; it now writes all four.

## [0.1.0] - 2026-09-19

The editor becomes Lumitra Mail: a multi-tenant mail service and marketing
platform, deployed at https://mail.lumitra.co (API, hosted pages, landing page)
and https://app.mail.lumitra.co (dashboard), with ŌPUNTIA's Studio as its first
client. Packages are versioned 0.1.0; their first npm publish is a manual step
(`scripts/first-publish.sh`).

### Added

#### Lumitra Mail service (`apps/service`)
- S0 foundation: workspaces, members and invitations, hashed and scoped API keys,
  audit log, idempotency keys, typed error envelope; every route mounted from the
  contract's route table; Postgres migrations applied at container start.
- S1 templates: versioned templates with conflict-safe saves, compile to MJML and
  HTML in a worker-thread pool, image assets in Storage Brain served from a stable
  `/a/:id` address, and an optional per-workspace policy that allows only
  service-hosted images and fonts.
- S2 sending: SMTP and Resend providers with sealed credentials and per-provider
  policies (the iCloud+ limits built in), contacts, topics and suppressions,
  mailings with a state machine, a send worker (`FOR UPDATE SKIP LOCKED`, rolling
  daily budget, minimum interval, retries, outcome-unknown never resent), a hosted
  unsubscribe page in five languages with one-click unsubscribe (RFC 8058), and
  signed webhooks with retries and an SSRF guard.
- Bounces and complaints: hard SMTP rejections and Resend bounce and complaint
  events suppress the address; a per-mailing and a per-provider circuit breaker
  stop mass false suppression and revert exactly.
- S4 platform: tags, typed contact properties, segments compiled to parameterised
  SQL, resumable CSV imports, hosted signup forms with double opt-in, scheduling,
  A/B tests, and open and click tracking that is off by default.
- S5 billing: plans and limits with usage metering, Stripe Checkout and portal on
  the shared account (fail-closed until configured), a signed Stripe webhook with
  reconciliation, and an operator-only billing exemption.
- Company erasure through auth-brain's `tenant.erased`.
- Public landing page at `/` in five languages, `robots.txt` and sitemap.

#### Dashboard (`apps/dashboard`)
- Next.js 16 app at app.mail.lumitra.co, signed in through auth-brain with a second
  factor and the `mail` app grant; every screen over the SDK, server-side only:
  workspaces, members and invitations, API keys, providers, topics, webhooks,
  templates with the editor, mailings with live progress, the sent archive,
  contacts, suppressions, the audit log, the S4 marketing screens and billing.

#### Typed client (`@marlinjai/mail-sdk` 0.1.0)
- Built on the contract's route table: retries with a stable idempotency key,
  typed errors, cursor pagination, response headers via `onResponse`, and webhook
  verification for receivers.

#### Editor packages (0.1.0)
- React 19, Next 16 and Tailwind 4 hosts: a stylesheet scoped under `.ee-root`,
  the `onRequestImage` hook, `migrateTemplate`, documents without an id, and a
  checked Trusted Publishing release path for all six published packages.

#### Earlier work in this release


#### Mail service API contract (`@marlinjai/mail-contract` 0.1.0)
- zod schemas and types for every v1 request, response and error of the mail
  service (workspaces, members, API keys, audit log, templates, compile, assets,
  providers, topics, contacts, suppressions, mailings, recipients, messages,
  webhooks), plus typed S4 (platform) and S5 (billing) namespaces.
- A typed route table (operation id to method, path, schemas, access, phase),
  the mailing state machine as data, the error-code-to-status map, and webhook
  signing and verification over Web Crypto.
- Documentation: `docs/public/mail-contract.md`.

#### Canvas UX (depth-2 nested columns)
- A column can be split into 2-4 sub-columns via the inspector or merged
  back into a single column. Sub-columns hold leaf blocks only (text, image,
  button, divider, spacer, social); container blocks are filtered out of
  the palette while a sub-column is selected.
- Sub-columns are first-class on the canvas: handle-on-hover at top-center,
  inset blue selection ring, dedicated inspector panel, layers-panel nesting
  one level deeper than columns.
- Backspace deletes the selected sub-column. When the parent would be left
  with a single sub-column, blocks auto-merge back into the parent column.
- Compiles to a sealed `<mj-raw>` HTML island wrapping a hand-built nested
  `<table>` inside the parent `<mj-column>`. The responsive media query
  (sub-columns stack to full width on mobile) is injected once at document
  head whenever any column in the template uses sub-columns. Targets the
  85-90% client tier (Apple Mail + Gmail + modern Outlook); Classic Outlook
  for Windows is out of scope (retiring October 2026).
- Spec: `docs/superpowers/specs/2026-04-26-nested-columns-design.md`.
  Tier rationale: `docs/internal/email-client-rendering-landscape.md`.

#### Phase 0 - Foundation
- Marketing landing page at `/` with indigo-themed design
- Editor moved to `/editor` route
- Clearify documentation with public and internal sections
- Cloudflare Workers deployment via OpenNext
- Custom domain: email-editor.lumitra.co
- Docs site: docs.email-editor.lumitra.co
- Platform vision and roadmap for template management, campaigns, and analytics
- Accordion block renderer (interactive expand/collapse preview)
- Navbar block renderer (navigation link preview with hamburger icon)
- Carousel block renderer (image slideshow with thumbnails and navigation)
- Table block renderer (data table with headers and rows)
- Header block renderer (branded/locked newsletter header)
- Footer block renderer (branded/locked newsletter footer)
- Vitest test infrastructure across core, blocks, and editor packages
- 181 unit tests for core (schema validation, block registry, MST store, MJML compiler)
- 20 integration tests for standard block registry (all 14 types)

#### Phase 1 - Template Management (`@marlinjai/email-templates`)
- Template library dashboard with card grid, filters, and pagination
- Template CRUD (create, duplicate, rename, delete, archive)
- Template categories and tags
- Version history per template with restore capability
- Import/export templates (JSON + HTML)
- Data Brain adapter for template storage
- 39 tests

#### Phase 2 - Contacts & Audiences (`@marlinjai/email-contacts`)
- Contact list management with bulk operations
- CSV import with delimiter detection and field mapping
- Segments with rule-based evaluation (10 operators, AND/OR logic)
- Merge fields / personalization tokens (`{{first_name}}`)
- Unsubscribe management with signed tokens (CAN-SPAM / GDPR / RFC 8058)
- 96 tests

#### Phase 3 - Campaign Builder (`@marlinjai/email-campaigns`)
- Campaign creation wizard (template -> audience -> configure -> send)
- Resend sending adapter (`@marlinjai/email-send-adapter-resend`)
- Campaign scheduling (now, later, timezone-aware)
- Send preview / test email
- A/B testing (subject line variants, content variants, automatic winner selection)
- Campaign status dashboard (draft, scheduled, sending, sent, failed)
- Tracking pixel injection and click-wrap link rewriting
- 51 tests (45 campaigns + 6 resend adapter)

#### Phase 4 - Analytics (`@marlinjai/email-analytics`)
- Open/click/bounce/unsubscribe tracking with event ingestion
- Click heatmap overlay with intensity levels
- Per-contact engagement scoring with recency decay
- Campaign comparison reports (side-by-side metrics)
- CSV export for stats, events, and link clicks
- Tracking pixel endpoint (1x1 GIF) and click redirect endpoint
- 61 tests

#### Phase 5 - Teams & Workspaces (`@marlinjai/email-teams`)
- Multi-user workspaces with roles (owner, admin, editor, viewer)
- Approval workflows (request, approve, reject)
- Template locking for approved templates
- Audit trail with filtered queries
- Brand kit (colors, fonts, logo upload via Storage Brain)
- Workspace scoping for templates and contacts with permission checks
- WorkspaceSwitcher component with role badges
- 59 tests

#### Phase 6 - Automation (`@marlinjai/email-automation`)
- Trigger-based email sequences (event, schedule, manual triggers)
- Automation engine with enrollment tracking and step execution
- Conditional logic evaluator (contact data, engagement, event data)
- Step types: send_email, wait, condition (if/else), split (A/B)
- Webhook receiver for external event integration
- Visual sequence builder component
- 50 tests

#### Dashboard UI Shell
- SaaS dashboard layout with sidebar navigation
- Dashboard routes: Overview, Templates, Contacts, Campaigns, Analytics, Automations, Settings
- Mock data adapters for each route demonstrating component integration
- Link to visual email editor from dashboard sidebar
- Unified "Refined Midnight" visual identity across all surfaces

#### Shared Infrastructure (`@email-editor/shared`)
- Data Brain and Storage Brain client factories
- WorkspaceProvider, AuthProvider, PlatformProvider contexts
- Paginated query hook
- Schema bootstrapper for idempotent table creation
- 12 tests

### Changed
- All packages renamed from `@returnhypnosis/` to `@marlinjai/` scope
- Clearify dependency switched from local link to `@marlinjai/clearify@^1.6.6`
- Documentation reorganized into `docs/public/` and `docs/internal/` sections
- Mermaid diagrams enabled via client-side strategy
- Sidebar files migrated from hardcoded gray/blue to token-based color classes
- Example app upgraded to Next.js 16.1.6 and React 19
- pnpm updated to 9.15.0, removed redundant npm workspaces config

### Fixed
- Dashboard build errors resolved with correct type shapes

## [0.0.1] - 2026-02-10

### Added
- Initial email editor platform with MJML compilation
- Core package: MobX State Tree state management, Zod schema validation, MJML compiler
- UI package: 3-panel editor (sidebar, canvas, inspector), drag-and-drop via dnd-kit
- Blocks package: 14 block types (8 with visual renderers), 35 prebuilt section templates
- Editor package: high-level API (`createEditor()`) and React wrapper (`EmailEditorReact`)
- API monetization and template registry support
- Next.js example app with server-side MJML compilation
- Rich text editing via TipTap
- Undo/redo with Immer patches
- Device preview (desktop/mobile)
- Theming support via CSS custom properties
- Clearify docs integration
