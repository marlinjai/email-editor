'use client';

import { WorkspaceSettings } from '@marlinjai/email-teams';
import type { WorkspaceMember, ApprovalRequest, AuditLogEntry, BrandKit } from '@marlinjai/email-teams';

const MOCK_MEMBERS: WorkspaceMember[] = [
  {
    id: 'm1',
    workspaceId: 'ws1',
    userId: 'u1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'owner',
    invitedAt: '2025-12-01T10:00:00Z',
  },
  {
    id: 'm2',
    workspaceId: 'ws1',
    userId: 'u2',
    email: 'editor@example.com',
    name: 'Editor User',
    role: 'editor',
    invitedAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'm3',
    workspaceId: 'ws1',
    userId: 'u3',
    email: 'viewer@example.com',
    name: 'Viewer User',
    role: 'viewer',
    invitedAt: '2026-02-01T12:00:00Z',
  },
];

const MOCK_APPROVALS: ApprovalRequest[] = [];

const MOCK_AUDIT_ENTRIES: AuditLogEntry[] = [
  {
    id: 'al1',
    workspaceId: 'ws1',
    userId: 'u1',
    action: 'template.create',
    resourceType: 'template',
    resourceId: 't3',
    details: { description: 'Created template "Product Launch"' },
    occurredAt: '2026-02-20T11:00:00Z',
  },
  {
    id: 'al2',
    workspaceId: 'ws1',
    userId: 'u2',
    action: 'campaign.send',
    resourceType: 'campaign',
    resourceId: 'camp1',
    details: { description: 'Sent campaign "February Newsletter"' },
    occurredAt: '2026-02-18T10:00:00Z',
  },
];

const MOCK_BRAND_KIT: BrandKit = {
  id: 'bk1',
  workspaceId: 'ws1',
  name: 'Default Brand',
  colors: [
    { name: 'primary', value: '#6366f1', locked: true },
    { name: 'secondary', value: '#1e1b4b', locked: false },
    { name: 'accent', value: '#818cf8', locked: false },
    { name: 'background', value: '#ffffff', locked: false },
  ],
  fonts: [
    { name: 'heading', fontFamily: 'Inter, sans-serif', locked: false },
    { name: 'body', fontFamily: 'Georgia, serif', locked: false },
  ],
  logoUrl: undefined,
  createdAt: '2025-12-01T10:00:00Z',
  updatedAt: '2026-02-15T14:00:00Z',
};

export default function SettingsPage() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Settings</h1>
        <p>Workspace configuration, team members, and brand kit</p>
      </div>
      <div className="dashboard-section">
        <WorkspaceSettings
          workspaceName="My Workspace"
          members={MOCK_MEMBERS}
          currentUserId="u1"
          currentUserRole="owner"
          approvals={MOCK_APPROVALS}
          auditEntries={MOCK_AUDIT_ENTRIES}
          auditTotal={MOCK_AUDIT_ENTRIES.length}
          auditPage={1}
          auditPageSize={25}
          brandKit={MOCK_BRAND_KIT}
          onInviteMember={() => {}}
          onChangeMemberRole={() => {}}
          onRemoveMember={() => {}}
          onApprove={() => {}}
          onReject={() => {}}
          onAuditQueryChange={() => {}}
          onUpdateBrandColors={() => {}}
          onUpdateBrandFonts={() => {}}
          onUploadLogo={() => {}}
          onToggleColorLock={() => {}}
          onToggleFontLock={() => {}}
        />
      </div>
    </div>
  );
}
