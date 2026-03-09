# Roadmap

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
- [x] Data Brain adapter for template storage
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

- [ ] Live Data Brain integration (replace mock adapters)
- [ ] User authentication flow (login, signup, password reset)
- [ ] Billing and subscription management
- [ ] Custom domain support per workspace
- [ ] Email preview rendering service
- [ ] Webhook management UI for automation triggers
