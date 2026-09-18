# Roadmap

## Now

- [ ] Turn the editor into a multi-tenant mail service with ŌPUNTIA's admin as its
      first client [plan](docs/plans/2026-09-18-mail-service.md) : in progress, approved
      2026-09-18, built by an agent team in phases S0 to S5. Clients keep their people, the service keeps the mail:
      workspaces and API keys via auth-brain, a Postgres-backed API, a send worker
      with per-provider policies (iCloud+ SMTP first), suppression and preference
      topics, webhooks, a hosted unsubscribe page, and the editor published as an
      SDK. The Phase 0 to 7 "complete" marks below describe UI over mock adapters,
      not a running service (2026-09-18)
- [ ] npm: run `scripts/first-publish.sh` after `npm login` (try `--dry-run`
      first) to publish the six packages' first version (the editor set and
      `@marlinjai/mail-contract`, `@marlinjai/mail-sdk`); npm cannot attach a
      trusted publisher to a package that does not exist yet. Then register
      each trusted publisher exactly as the script prints (repository
      `marlinjai/email-editor`, workflow `publish.yml`) and push the two tags
      it prints; needs Marlin's npm account, details in the
      [plan](docs/plans/2026-09-18-mail-service.md) under question 4 (2026-09-18)
- [ ] Mail service: add a `topics.delete` route to the contract and the service
      (refused with `conflict` while a mailing uses the topic, which the schema
      already enforces) once a client needs to remove a topic; S2 ships without
      it [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Mail dashboard: once #21 is merged and `https://app.mail.lumitra.co/api/health`
      serves its commit, merge auth-brain#142 (shows the `mail` card and subscribes
      the service to `tenant.erased`); registering the erasure before
      `/internal/erasure` is deployed would hold every company erasure waiting. The
      first deploy creates the GHCR package `email-editor-dashboard` private; make it
      public in its settings (the API cannot), as the service's is. Marlin's
      own sign-in needs a second factor enrolled at auth.lumitra.co (the dashboard
      requires it) [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Mail service: decide whether to detect bounces that SMTP providers report
      later by email (iCloud+ reports almost all of them that way), which needs
      read access to the sender's inbox (IMAP, the Internet Message Access
      Protocol) and a parser for delivery status notifications; today only the
      immediate SMTP rejection and Resend's events suppress, and the provider card
      says so [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-19)
- [ ] Mail service: decide what `user.erased` means for workspace members (remove the
      person's member rows, and what happens to a workspace whose last owner is
      erased); today the service acknowledges it as a no-op and is subscribed only to
      `tenant.erased` [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Mail service: dashboard screens for the S4 platform features (tags and
      properties, segments with the count preview, the CSV import's mapping,
      dry run and report, signup forms and their embed, scheduling, A/B tests,
      tracking settings and campaign analytics), over the API S4 ships; built
      once the S3 dashboard has landed [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Decide whether hosts may add new block types (not only redefine the 14
      standard ones): it needs an open block type in the store and schema, a
      renderer hook for the canvas and a compile hook the server can trust.
      Until then the editor refuses a new type at setup (2026-09-18)
- [ ] Mail service billing, test mode: Marlin puts the shared Lumitra Stripe
      account's TEST secret key (`sk_test_...`, Stripe dashboard in test mode)
      into Infisical "Lumitra Mail" dev and prod as `STRIPE_SECRET_KEY`,
      replacing `PLACEHOLDER_REPLACE_ME` (no Infisical project holds a test
      key). Then one `execute_with_secrets` call runs
      `apps/service/scripts/stripe-setup.mjs` (catalogue, portal, webhook
      endpoint, ids and secret into dev and prod), exactly as
      `apps/service/README.md` "Stripe setup: one command" spells out; redeploy
      [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Mail service billing, live mode (Marlin's decision: prices, limits and
      tax in the plan's S5 defaults 1 and 2): `copy_secret op=copy` of
      `STRIPE_SECRET_KEY` from Infisical "lumitra-qr" prod to "Lumitra Mail"
      prod; rerun the setup command with `--live` and destinations in prod
      only; redeploy; then one real checkout, a plan switch in the portal and a
      cancellation, refunded [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Mail service dashboard: the billing screens (plan, usage with the 80
      percent warning, checkout, the portal) over `billing.*`, after S3 lands
      [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
- [ ] Lumitra Mail privacy notice (needs Marlin's legal review): lumitra.co/datenschutz
      covers the landing page but defers product-specific processing to a notice on
      the product's own domain, and Mail has none. Write `mail.lumitra.co/privacy`
      (what the service stores for workspaces and recipients, the processor role,
      sub-processors Hetzner, the workspace's provider and Storage Brain, erasure),
      publish the Art. 28 processing agreement template from "Legal shape", point the
      landing footer's privacy link at it, and add mail.lumitra.co to the subdomain
      list of lumitra.co/impressum [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-19)

## Recently shipped

- Lumitra Mail landing page live at `https://mail.lumitra.co/` in five
  languages (#31, 2026-09-19); `email-editor.lumitra.co` answers 308 to it
  through the redirect Worker, and email.lumitra.co links back (email-mcp #18)
  [plan](docs/plans/2026-09-18-mail-service.md)
- Depth-2 nested columns (a column can split into 2-4 sub-columns) with a
  full canvas UX: handle-on-hover, inspector panel, layers-panel nesting,
  Backspace-to-delete with auto-merge, container-block palette filter.
  Compiles to email-safe nested HTML for the 85-90% client tier
  (Apple Mail + Gmail + modern Outlook).

## Phase 0 - Foundation (complete)

- [x] Core editor with drag-and-drop blocks
- [x] MJML compilation (server-side)
- [x] MobX State Tree state management
- [x] 14 of 14 block types with visual renderers
- [x] 35 prebuilt section templates
- [x] Undo/redo, device preview, theming
- [x] Next.js example app
- [x] Clearify documentation
- [x] Cloudflare deployment at email-editor.lumitra.co
- [x] Rename packages from `@returnhypnosis/` to `@marlinjai/`
- [x] Complete remaining 6 block type renderers (Accordion, Navbar, Carousel, Table, Header, Footer)
- [x] Add test coverage (181 tests: schema, registry, store, compiler)

## Phase 1 - Template Management (complete)

- [x] Template library dashboard (card grid with thumbnails)
- [x] Template CRUD (create, duplicate, rename, delete, archive)
- [x] Template categories and tags
- [x] Auto-generated template thumbnails
- [x] Version history per template
- [x] Import/export templates (JSON + HTML)
- [x] DatabaseAdapter for template storage (originally shipped against Data Brain, migrated to generic `DatabaseAdapter` in 2026-03 after Data Brain archive)
- [x] Storage Brain adapter for image assets

## Phase 2 - Contacts & Audiences (complete)

- [x] Contact list management
- [x] CSV import
- [x] Segments and tags
- [x] Merge fields / personalization tokens (`{{first_name}}`)
- [x] Unsubscribe management (CAN-SPAM / GDPR)
- [x] Contact activity history

## Phase 3 - Campaign Builder (complete)

- [x] Campaign creation wizard (template -> audience -> configure -> send)
- [x] Resend sending adapter
- [x] Campaign scheduling (now, later, timezone-aware)
- [x] Send preview / test email
- [x] A/B testing (subject lines, content variants)
- [x] Campaign status dashboard

## Phase 4 - Analytics (complete)

- [x] Open/click/bounce tracking
- [x] Click heatmap on emails
- [x] Per-contact engagement scoring
- [x] Campaign comparison reports
- [x] Export reports

## Phase 5 - Teams & Workspaces (complete)

- [x] Multi-user workspaces with roles
- [x] Approval workflows
- [x] Template locking
- [x] Audit trail
- [x] Brand kit (locked colors, fonts, logos)

## Phase 6 - Automation (complete)

- [x] Trigger-based email sequences
- [x] Event-based sends
- [x] Conditional logic in sequences
- [x] External event integration hooks

## Phase 7 - SaaS Dashboard (complete)

- [x] Dashboard layout with sidebar navigation
- [x] Template management route
- [x] Contact management route
- [x] Campaign management route
- [x] Analytics dashboard route
- [x] Automations dashboard route
- [x] Workspace settings route
- [x] Mock data adapters for demo

## Future

The former open items here (a live database instead of the mock adapters, user
authentication, billing, custom domains, a preview rendering service, webhook
management) are now phases of the mail-service plan under "Now" and are tracked
there.
