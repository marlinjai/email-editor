# Email Editor - Boundary Specification

## One-Sentence Boundary

**Editor = create templates + preview + produce outputs (MJML/HTML + metadata).**  
**Client app = chooses how to store templates, manage audiences, and send emails (Resend, SES, SendGrid, etc.).**

---

## Core Principle

The email editor is a **template authoring tool**, not an email platform.  
It's framework-agnostic, provider-agnostic, and deployment-agnostic.

Think of it like:
- **Figma** (design tool) vs **GitHub** (collaboration/storage)
- **VS Code** (editor) vs **Git** (version control)

---

## What Belongs INSIDE the Editor (Core)

These are the **editor's responsibilities**:

### Must-Haves

1. **Visual block editor UI**
   - Drag-and-drop block placement (dnd-kit)
   - Click-to-select blocks
   - Property inspector for editing
   - Canvas preview (iframe-based)
   - 3-way drop intent (before/after/inside)

2. **Template JSON schema**
   - `EmailTemplate` type with sections, columns, blocks
   - Zod validation
   - Type-safe block definitions

3. **Export outputs**
   - `html` (required) - email-safe HTML
   - `mjml` (optional) - MJML source
   - `subject`, `preheader` (metadata)

4. **Live preview**
   - Device toggle (desktop/mobile)
   - Real-time compilation

5. **Assets handling hooks**
   - `uploadAsset(file)` callback provided by host
   - Editor doesn't store files, just calls the hook

6. **Centralized state management**
   - Zustand store with document/interaction/api slices
   - History middleware for undo/redo
   - Validation middleware for MJML constraints

### Nice-to-Haves (Still Editor-ish)

7. **Variables/merge tags**
   - Support `{{first_name}}`, `{{company}}`
   - Host provides available tags via `getMergeTags()` hook

8. **Template validation**
   - Missing alt text
   - Empty links
   - Broken images

9. **Versioning hooks**
   - `onSave(template)` callback
   - Host decides where to store (DB/Git/S3)

10. **Undo/Redo**
    - Zustand middleware with Immer patches
    - Efficient patch-based history

---

## Centralized State Management (Zustand Store)

The editor uses a centralized Zustand store with three slices:

### Document Slice (Authoritative State)
- Template structure (sections, columns, blocks)
- CRUD operations for all nodes
- mj-group abstraction via `setMobileHorizontal()`
- Integrated with history middleware

### Interaction Slice (Ephemeral UI State)
- Current selection (block/section/column)
- Drag state (isDragging, dropIntent)
- Resize state (for canvas handles)
- High-frequency updates that don't affect document

### API Slice (Monetization Configuration)
- API key for compile endpoint
- Compile endpoint URL
- Preview mode flag
- Usage tracking

### Middleware

**History Middleware:**
- Tracks document changes automatically
- Uses Immer patches for efficient undo/redo
- Skips interaction state changes

**Validation Middleware:**
- Enforces MJML nesting rules
- Provides smart fallbacks for invalid operations
- Ensures document is always MJML-valid

---

## mj-group Abstraction

The editor uses `mj-group` for mobile-horizontal layouts but hides this from users:

### User-Facing Model
- Sections contain columns
- Columns contain blocks
- "Keep columns side-by-side on mobile" toggle in section inspector

### Internal Implementation
- `Section.noStack` flag controls mj-group output
- When enabled: compiler wraps columns in `<mj-group>`
- Column widths forced to percentages
- Layers panel never shows "group" nodes

### Why This Matters
- Users think in terms of "Section → Columns"
- They don't need to understand mj-group semantics
- The abstraction handles MJML complexity automatically

---

## What Belongs in the CLIENT APP (Host)

These are the **host application's responsibilities**:

### Infrastructure

1. **Authentication / permissions**
   - Who can edit which templates
   - Role-based access control

2. **Template storage**
   - Database (PostgreSQL, MongoDB)
   - Git repository
   - S3/object storage

3. **Asset storage**
   - Implements `uploadAsset()` to upload images
   - Returns public URL

### Email Platform Features

4. **Audience / contacts / segmentation**
   - Contact lists
   - Segments (e.g. "premium users", "inactive users")
   - Import/export contacts
   - Suppression lists

5. **Campaign creation & scheduling**
   - "Send now" vs "Schedule for later"
   - A/B testing
   - Recurring sends

6. **Send pipeline + provider integration**
   - **Resend** (or SendGrid, SES, Mailgun, etc.)
   - Rate limiting
   - Bounce handling
   - Retry logic

7. **Analytics & tracking**
   - Open tracking
   - Click tracking
   - Unsubscribe tracking
   - Conversion attribution

8. **Compliance & legal**
   - Unsubscribe links
   - GDPR consent management
   - CAN-SPAM compliance
   - Privacy policy

---

## Monetization Boundary

The editor follows a hybrid monetization model:

### What Ships via npm (Public, Free)

- React UI components (Canvas, Toolbar, Inspector, Layers)
- JSON schema and TypeScript types
- Block definitions and registry
- Zustand store infrastructure
- Client-side preview (for development)

### What Runs on API (Protected, Monetized)

- MJML compiler (production compiles require API key)
- Usage tracking and billing
- Future: Template library, AI content generation

### Pricing Tiers (Planned)

| Tier | Price | Limits | Features |
|------|-------|--------|----------|
| Free | $0 | 100 compiles/month | Watermark in HTML output |
| Pro | $29/mo | 10,000 compiles/month | No watermark, priority support |
| Scale | $99/mo | 100,000 compiles/month | Volume pricing, SLA |

### Integration Flow

```typescript
// Development: Local preview (free, unlimited)
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  // No apiKey = client-side preview only
/>

// Production: API compilation (metered)
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  apiKey="rh_live_xxxxx"
  compileEndpoint="https://api.returnhypnosis.com/compile"
/>
```

---

## The Boundary Interface (TypeScript Contract)

### Editor Exports (What the Editor Provides)

```typescript
// @marlinjai/email-editor-core

// Store exports
export { useEditorStore, createEditorStore } from './store';
export type { 
  DocumentState, 
  InteractionState, 
  APIState,
  DropIntent,
  EditorStore,
} from './store';

// Schema exports
export type { EmailTemplate, Section, Column, Block } from './schema';

// Validation exports
export { validateDropIntent, computeValidatedDropIntent } from './store/middleware';
```

### Store Actions (Document Slice)

```typescript
interface DocumentState {
  template: EmailTemplate;
  
  // Block operations
  insertBlock: (columnId: string, index: number, block: Block) => void;
  moveBlock: (blockId: string, targetColumnId: string, targetIndex: number) => void;
  updateBlock: (blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (blockId: string) => void;
  
  // Section operations
  insertSection: (index: number, section: Section) => void;
  moveSection: (sectionId: string, targetIndex: number) => void;
  updateSection: (sectionId: string, updates: Partial<Section>) => void;
  deleteSection: (sectionId: string) => void;
  
  // Column operations
  updateColumn: (columnId: string, updates: Partial<Column>) => void;
  setColumnCount: (sectionId: string, count: number) => void;
  setMobileHorizontal: (sectionId: string, enabled: boolean) => void;
  
  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
```

### Host Implements (What the Client App Provides)

```typescript
// Defined by the app using the editor

type EmailEditorHost = {
  // Required: Image upload
  uploadAsset(file: File): Promise<{ url: string }>;

  // Optional: Send test email (Resend, SES, etc.)
  sendTestEmail?: (args: {
    to: string;
    subject: string;
    html: string;
  }) => Promise<void>;

  // Optional: Provide merge tags available in this workspace
  getMergeTags?: () => Promise<Array<{
    key: string;       // e.g. "first_name"
    label: string;     // e.g. "First Name"
    example: string;   // e.g. "John"
  }>>;

  // Optional: Audience picker for campaigns
  listAudiences?: () => Promise<Array<{
    id: string;
    name: string;
    count?: number;
  }>>;

  // Optional: Save handler
  onSave?: (template: EmailTemplateDoc) => Promise<void>;
};
```

---

## Integration Patterns

### Pattern 1: Standalone Editor (Library Mode)

**Use case:** Embed the editor into an existing app

```typescript
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

function TemplateEditor() {
  const [template, setTemplate] = useState(initialTemplate);
  
  return (
    <EmailEditorReact
      value={template}
      onChange={setTemplate}
      uploadAsset={uploadToS3}
      apiKey={process.env.EMAIL_EDITOR_API_KEY}
      onSave={saveToDatabase}
    />
  );
}
```

### Pattern 2: Full Email Platform (Integrated Mode)

**Use case:** Build an email platform around the editor

Your app has:
- `/templates` - template library (uses editor)
- `/audiences` - contact management
- `/campaigns` - campaign builder + scheduler
- `/analytics` - reporting dashboard

The editor is just one piece:

```typescript
// app/templates/[id]/edit/page.tsx
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  uploadAsset={uploadToS3}
  getMergeTags={fetchFromDB}
  onSave={saveToPostgres}
/>

// Separately, you build:
// app/campaigns/new/page.tsx - Campaign creation form
// app/audiences/page.tsx - Contact list management
// lib/email/resend.ts - Resend integration
```

---

## Where Resend Fits

Resend provides:
- Email **sending** API
- Sometimes **audience/contacts** features
- Sometimes **templates** (we replace this)

### Recommended Resend Integration

**Editor:** Stays Resend-agnostic

**Host app:** Implements Resend adapter

```typescript
// lib/email/adapters/resend.ts

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTestEmail({ to, subject, html }: {
  to: string;
  subject: string;
  html: string;
}) {
  await resend.emails.send({
    from: 'noreply@example.com',
    to,
    subject,
    html,
  });
}

export async function sendCampaign({
  audienceId,
  subject,
  html,
}: {
  audienceId: string;
  subject: string;
  html: string;
}) {
  const contacts = await db.contacts.findMany({ audienceId });
  for (const contact of contacts) {
    await resend.emails.send({
      from: 'noreply@example.com',
      to: contact.email,
      subject,
      html: replaceVariables(html, contact),
    });
  }
}
```

**Why this works:**
- Editor doesn't care about Resend
- You can swap to SendGrid/SES later
- You can support multiple providers

---

## Data Model: Editor vs Host

### Editor's Data Model (JSON)

```typescript
interface EmailTemplateDoc {
  version: '1.0';
  metadata: {
    subject?: string;
    preheader?: string;
  };
  sections: Section[];
}
```

This is all the editor knows.

### Host's Data Model (Database)

```typescript
// Your database schema

table templates {
  id: uuid
  name: string
  description: text
  content: jsonb              // EmailTemplateDoc (editor state)
  created_at: timestamp
  updated_at: timestamp
  created_by: uuid            // user_id
}

table audiences {
  id: uuid
  name: string
  contact_count: int
  filters: jsonb              // { status: 'active', plan: 'pro' }
}

table campaigns {
  id: uuid
  template_id: uuid           // FK → templates
  audience_id: uuid           // FK → audiences
  subject: string
  status: enum                // draft, scheduled, sent
  scheduled_at: timestamp
  sent_at: timestamp
  provider: string            // 'resend', 'sendgrid', etc.
}
```

---

## Minimal Host Implementation (Checklist)

To integrate the editor, you need:

- [ ] **Asset upload endpoint** (`POST /api/assets/upload`)
- [ ] **Template storage** (DB table: `templates`)
- [ ] **Save endpoint** (`POST /api/templates`)
- [ ] **Load endpoint** (`GET /api/templates/:id`)
- [ ] **Test send endpoint** (`POST /api/email/test`) - uses Resend

Optional (for full platform):

- [ ] Audiences table + CRUD
- [ ] Campaigns table + scheduler
- [ ] Analytics tracking
- [ ] Unsubscribe handling

---

## FAQ: Boundary Questions

### Q: Does the editor store templates?
**A:** No. The editor is stateless. You pass `value` and get `onChange` callbacks.  
You decide where to store (DB/Git/LocalStorage).

### Q: Does the editor send emails?
**A:** No. The editor exports `{ html, subject }`.  
You pass that to Resend/SendGrid/etc.

### Q: Does the editor manage contacts?
**A:** No. The editor doesn't know about "contacts" or "audiences".  
You manage that in your app/DB and optionally provide `listAudiences()` hook.

### Q: Does the editor track opens/clicks?
**A:** No. You add tracking pixels/UTMs when you send via Resend.

### Q: Can I swap providers later (Resend → SendGrid)?
**A:** Yes! The editor doesn't depend on any provider.  
You just swap the adapter in your host app.

### Q: Can multiple apps use the same editor?
**A:** Yes! Ship it as `@marlinjai/email-editor` npm package.  
Each app implements its own `uploadAsset()`, `sendTestEmail()`, etc.

### Q: What's the state management approach?
**A:** Zustand store with three slices (document, interaction, API).  
History middleware provides undo/redo with Immer patches.

### Q: How does mj-group work?
**A:** Users toggle "Keep columns side-by-side on mobile" in section settings.  
The editor internally sets `Section.noStack=true` and the compiler outputs `<mj-group>`.

---

## Summary

| Concern | Owner | Implementation |
|---------|-------|----------------|
| Visual editing UI | **Editor** | React components |
| Template JSON schema | **Editor** | Zod validation |
| State management | **Editor** | Zustand store |
| MJML → HTML compilation | **Editor** | `MJMLCompiler` |
| Preview rendering | **Editor** | Iframe |
| Undo/Redo | **Editor** | History middleware |
| mj-group abstraction | **Editor** | `setMobileHorizontal()` |
| Template storage | **Host** | PostgreSQL/Git/S3 |
| Asset storage | **Host** | S3/Cloudinary/etc. |
| Audience management | **Host** | DB + UI |
| Email sending | **Host** | Resend/SendGrid/SES |
| Campaign scheduling | **Host** | Job queue |
| Analytics tracking | **Host** | Pixels/webhooks |
| Compliance (unsubscribe) | **Host** | Middleware |

---

## Next Steps

1. [x] Define this boundary (done)
2. [x] Create `.cursor/boundary/` folder (done)
3. [x] Build editor core (done)
4. [x] Implement Zustand store architecture (done)
5. [x] Add history middleware (done)
6. [x] Add validation middleware (done)
7. [ ] Complete Framer-like DnD UX
8. [ ] Add canvas direct manipulation (resize handles)
9. [ ] Build API monetization layer
10. [ ] Create example host adapter for Resend
11. [ ] Build reference implementation (Next.js + Resend)

---

**Last updated:** 2026-01-04
