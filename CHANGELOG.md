# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
