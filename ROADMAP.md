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
- [ ] Mail dashboard: Marlin enrolls a second factor at auth.lumitra.co for his
      own sign-in to app.mail.lumitra.co, which requires one (#21 is deployed,
      auth-brain#142 merged, the GHCR package public)
      [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-19)
- [ ] Mail service: decide what `user.erased` means for workspace members (remove the
      person's member rows, and what happens to a workspace whose last owner is
      erased); today the service acknowledges it as a no-op and is subscribed only to
      `tenant.erased` [plan](docs/plans/2026-09-18-mail-service.md) (2026-09-18)
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

## Recently shipped

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
