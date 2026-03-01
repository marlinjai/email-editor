---
title: Email Editor Platform Vision
description: High-level product direction for evolving the email editor into a full platform
order: 1
icon: "🗺️"
---

# Email Editor Platform Vision

**Date:** 2026-02-21
**Status:** Approved direction - pending implementation planning

## The Two-Sided Play

**For Developers:** `npm install @marlinjai/email-editor` - drop a visual email editor into any React app. Bring your own database (Data Brain adapter), your own storage (Storage Brain adapter), your own sending provider (Resend adapter to start). Everything is pluggable.

**For End Users (via hosted SaaS at email-editor.lumitra.co):** A full email creation and campaign management platform. No coding needed. Create templates, manage contact lists, build campaigns, preview on all devices, send through integrated providers.

## Target Audiences

- **Primary (integration):** Developers and SaaS builders who `npm install` the packages into their own apps
- **Primary (end user):** Marketers, content teams, and small business owners who use the editor through a host application
- **Internal:** The MarlinJai ERP suite, where the email editor is one module among many

## Business Model

- **Open-source packages (MIT):** All `@marlinjai/email-editor-*` packages are free
- **Paid compile API:** MJML compilation API with tiered pricing (Free: 100/month with watermark, Pro: $29/mo 10k, Scale: $99/mo 100k)
- **Freemium hosted SaaS:** email-editor.lumitra.co with free tier (3 templates, 100 sends/month, 1 user) scaling to Pro and Scale plans

## Feature Tiers

### Tier 1 - Template Management

What's missing today. The editor handles a single template at a time.

- Template library with create / duplicate / rename / delete / archive
- Template categories and tags for organization
- Template thumbnails (auto-generated previews)
- Version history per template (rollback to previous versions)
- Import/export templates (JSON + HTML)

### Tier 2 - Contact & Audience Management

- Contact lists with import (CSV, manual add)
- Segments and tags for targeting
- Unsubscribe management (CAN-SPAM / GDPR compliance built in)
- Merge fields / personalization tokens (e.g. `{{first_name}}`)
- Contact activity history (sent, opened, clicked)

### Tier 3 - Campaign Builder

- Campaign creation workflow: pick template -> select audience -> configure -> schedule/send
- Campaign scheduling (send now, send later, timezone-aware)
- A/B testing (subject lines, content variants)
- Campaign status dashboard (draft, scheduled, sending, sent)
- Send preview / test email before sending

### Tier 4 - Analytics & Tracking

- Open rates, click rates, bounce rates per campaign
- Click heatmap on email (which links get clicked)
- Per-contact engagement scoring
- Campaign comparison over time
- Export reports

### Tier 5 - Team & Workspace

- Multi-user workspaces with roles (admin, editor, viewer)
- Approval workflows (draft -> review -> approved -> send)
- Template locking (prevent accidental edits to approved templates)
- Activity log / audit trail
- Brand kit (locked colors, fonts, logos that stay consistent)

### Tier 6 - Automation (future)

- Trigger-based email sequences (welcome series, onboarding drip)
- Event-based sends (purchase confirmation, cart abandonment)
- Conditional logic in sequences (if opened -> send X, else -> send Y)
- Integration hooks for external events

## Package Ecosystem

All packages under `@marlinjai/` scope, MIT licensed.

| Package | Purpose | Status |
|---------|---------|--------|
| `@marlinjai/email-editor` | Visual editor (high-level API + React wrapper) | Exists (as @returnhypnosis, needs rename) |
| `@marlinjai/email-editor-core` | Schema, MJML compiler, state management | Exists (needs rename) |
| `@marlinjai/email-editor-ui` | React UI components | Exists (needs rename) |
| `@marlinjai/email-editor-blocks` | Standard block library | Exists (needs rename) |
| `@marlinjai/email-templates` | Template CRUD, versioning, thumbnails | New - Tier 1 |
| `@marlinjai/email-campaigns` | Campaign builder, scheduling, A/B testing | New - Tier 3 |
| `@marlinjai/email-contacts` | Contact management, segments, merge fields | New - Tier 2 |
| `@marlinjai/email-analytics` | Tracking pixels, click tracking, reports | New - Tier 4 |
| `@marlinjai/email-send-adapter-resend` | Resend sending adapter | New - Tier 3 |
| `@marlinjai/email-send-adapter-sendgrid` | SendGrid sending adapter | Future |

## Data Layer

Adapter pattern consistent with the ERP suite architecture:

- **Data Brain** for structured data (templates, campaigns, contacts, analytics)
- **Storage Brain** for file assets (images, attachments, thumbnails)
- Developers can swap in their own adapters (D1, Supabase, custom)

## UI Direction

- **Dashboard:** Template gallery view (card grid with live thumbnails)
- **Campaign builder:** Wizard-style flow with progress indicator
- **Editor:** Stays light-themed (white canvas, creation tool feel)
- **Platform chrome (dashboard, nav, settings):** Dark indigo theme from the landing page
- Clear visual separation between "managing" (dark) and "creating" (light)

## Pre-requisite: Package Rename

Before any new development, rename all existing packages from `@returnhypnosis/` to `@marlinjai/`:

- `@marlinjai/email-editor` -> `@marlinjai/email-editor`
- `@marlinjai/email-editor-core` -> `@marlinjai/email-editor-core`
- `@marlinjai/email-editor-ui` -> `@marlinjai/email-editor-ui`
- `@marlinjai/email-editor-blocks` -> `@marlinjai/email-editor-blocks`

## Implementation Priority

1. Package rename to `@marlinjai/` scope
2. Tier 1: Template management (the immediate next step)
3. Tier 2: Contacts (needed before campaigns can send)
4. Tier 3: Campaigns (the core value proposition)
5. Tier 4: Analytics (makes campaigns measurable)
6. Tier 5: Teams (multi-user support)
7. Tier 6: Automation (advanced workflows)
