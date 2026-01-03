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

### Nice-to-Haves (Still Editor-ish)

6. **Variables/merge tags**
   - Support `{{first_name}}`, `{{company}}`
   - Host provides available tags via `getMergeTags()` hook

7. **Template validation**
   - Missing alt text
   - Empty links
   - Broken images

8. **Versioning hooks**
   - `onSave(template)` callback
   - Host decides where to store (DB/Git/S3)

9. **Undo/Redo**
   - In-memory history (Immer-based)

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

## The Boundary Interface (TypeScript Contract)

### Editor Exports (What the Editor Provides)

```typescript
// @returnhypnosis/email-editor

type EmailEditor = {
  getValue(): EmailTemplateDoc;         // Get current JSON
  setValue(doc: EmailTemplateDoc): void; // Load template

  export(): Promise<{
    subject: string;
    preheader?: string;
    html: string;                       // Email-safe HTML
    mjml?: string;                      // Optional MJML source
  }>;

  validate(): ValidationIssue[];        // Check for errors
  undo(): void;
  redo(): void;
  destroy(): void;
};
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
import { createEmailEditor } from '@returnhypnosis/email-editor';

const editor = createEmailEditor({
  container: document.getElementById('editor'),
  initialValue: savedTemplate,
  
  // Host provides these adapters
  uploadAsset: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json(); // { url: 'https://cdn.example.com/image.png' }
  },
  
  sendTestEmail: async ({ to, subject, html }) => {
    await fetch('/api/email/test', {
      method: 'POST',
      body: JSON.stringify({ to, subject, html }),
    });
  },
  
  getMergeTags: async () => {
    return [
      { key: 'first_name', label: 'First Name', example: 'John' },
      { key: 'company', label: 'Company', example: 'Acme Inc' },
    ];
  },
});
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
  // Option A: Use Resend audiences
  const audience = await resend.audiences.get(audienceId);
  // ... send to all contacts in audience

  // Option B: Use your own DB
  const contacts = await db.contacts.findMany({ audienceId });
  for (const contact of contacts) {
    await resend.emails.send({
      from: 'noreply@example.com',
      to: contact.email,
      subject,
      html: replaceVariables(html, contact), // {{first_name}} → contact.firstName
    });
  }
}
```

**Why this works:**
- Editor doesn't care about Resend
- You can swap to SendGrid/SES later
- You can support multiple providers

---

## Example: Multi-Provider Support

```typescript
// lib/email/send.ts

type EmailProvider = 'resend' | 'sendgrid' | 'ses';

export async function sendEmail({
  provider,
  to,
  subject,
  html,
}: {
  provider: EmailProvider;
  to: string;
  subject: string;
  html: string;
}) {
  switch (provider) {
    case 'resend':
      return sendViaResend({ to, subject, html });
    case 'sendgrid':
      return sendViaSendGrid({ to, subject, html });
    case 'ses':
      return sendViaSES({ to, subject, html });
  }
}
```

The editor never knows which provider you chose.

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

table campaign_analytics {
  campaign_id: uuid
  opens: int
  clicks: int
  bounces: int
  unsubscribes: int
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
**A:** Yes! Ship it as `@returnhypnosis/email-editor` npm package.  
Each app implements its own `uploadAsset()`, `sendTestEmail()`, etc.

---

## Summary

| Concern | Owner | Implementation |
|---------|-------|----------------|
| Visual editing UI | **Editor** | React components |
| Template JSON schema | **Editor** | Zod validation |
| MJML → HTML compilation | **Editor** | `MJMLCompiler` |
| Preview rendering | **Editor** | Iframe |
| Undo/Redo | **Editor** | `HistoryManager` |
| Template storage | **Host** | PostgreSQL/Git/S3 |
| Asset storage | **Host** | S3/Cloudinary/etc. |
| Audience management | **Host** | DB + UI |
| Email sending | **Host** | Resend/SendGrid/SES |
| Campaign scheduling | **Host** | Job queue |
| Analytics tracking | **Host** | Pixels/webhooks |
| Compliance (unsubscribe) | **Host** | Middleware |

---

## Next Steps

1. ✅ Define this boundary (done)
2. ✅ Create `.cursor/boundary/` folder (done)
3. [ ] Build editor core (in progress)
4. [ ] Create example host adapter for Resend
5. [ ] Document integration patterns
6. [ ] Build reference implementation (Next.js + Resend)

