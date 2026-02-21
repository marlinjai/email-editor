---
title: Roadmap
description: Development roadmap for the email editor platform
order: 2
icon: milestone
---

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

## Phase 1 - Template Management

- [ ] Template library dashboard (card grid with thumbnails)
- [ ] Template CRUD (create, duplicate, rename, delete, archive)
- [ ] Template categories and tags
- [ ] Auto-generated template thumbnails
- [ ] Version history per template
- [ ] Import/export templates (JSON + HTML)
- [ ] Data Brain adapter for template storage
- [ ] Storage Brain adapter for image assets

## Phase 2 - Contacts & Audiences

- [ ] Contact list management
- [ ] CSV import
- [ ] Segments and tags
- [ ] Merge fields / personalization tokens (`{{first_name}}`)
- [ ] Unsubscribe management (CAN-SPAM / GDPR)
- [ ] Contact activity history

## Phase 3 - Campaign Builder

- [ ] Campaign creation wizard (template -> audience -> configure -> send)
- [ ] Resend sending adapter
- [ ] Campaign scheduling (now, later, timezone-aware)
- [ ] Send preview / test email
- [ ] A/B testing (subject lines, content variants)
- [ ] Campaign status dashboard

## Phase 4 - Analytics

- [ ] Open/click/bounce tracking
- [ ] Click heatmap on emails
- [ ] Per-contact engagement scoring
- [ ] Campaign comparison reports
- [ ] Export reports

## Phase 5 - Teams & Workspaces

- [ ] Multi-user workspaces with roles
- [ ] Approval workflows
- [ ] Template locking
- [ ] Audit trail
- [ ] Brand kit (locked colors, fonts, logos)

## Phase 6 - Automation (future)

- [ ] Trigger-based email sequences
- [ ] Event-based sends
- [ ] Conditional logic in sequences
- [ ] External event integration hooks
