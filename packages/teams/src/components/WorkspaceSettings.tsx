import { useState } from 'react';
import type { WorkspaceMember, WorkspaceRole, ApprovalRequest, AuditLogEntry, BrandKit, AuditLogQueryOptions, ApprovalResourceType } from '../types';
import { MemberList } from './MemberList';
import { ApprovalQueue } from './ApprovalQueue';
import { AuditLogViewer } from './AuditLogViewer';
import { BrandKitEditor } from './BrandKitEditor';

type Tab = 'members' | 'approvals' | 'audit' | 'brand';

export interface WorkspaceSettingsProps {
  workspaceName: string;
  members: WorkspaceMember[];
  currentUserId: string;
  currentUserRole: WorkspaceRole;
  approvals: ApprovalRequest[];
  auditEntries: AuditLogEntry[];
  auditTotal: number;
  auditPage: number;
  auditPageSize: number;
  brandKit: BrandKit | null;

  onInviteMember: (email: string, role: WorkspaceRole) => void;
  onChangeMemberRole: (memberId: string, newRole: WorkspaceRole) => void;
  onRemoveMember: (memberId: string) => void;

  onApprove: (approvalId: string, note?: string) => void;
  onReject: (approvalId: string, note?: string) => void;

  onAuditQueryChange: (options: AuditLogQueryOptions) => void;

  onUpdateBrandColors: (colors: BrandKit['colors']) => void;
  onUpdateBrandFonts: (fonts: BrandKit['fonts']) => void;
  onUploadLogo: (file: File) => void;
  onToggleColorLock: (colorName: string, locked: boolean) => void;
  onToggleFontLock: (fontName: string, locked: boolean) => void;
}

export function WorkspaceSettings(props: WorkspaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalResourceType | undefined>();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: 'Members' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'audit', label: 'Audit Log' },
    { key: 'brand', label: 'Brand Kit' },
  ];

  return (
    <div>
      <h2>{props.workspaceName} Settings</h2>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e0e0e0', marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #0066cc' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'members' && (
        <MemberList
          members={props.members}
          currentUserId={props.currentUserId}
          currentUserRole={props.currentUserRole}
          onInvite={props.onInviteMember}
          onChangeRole={props.onChangeMemberRole}
          onRemove={props.onRemoveMember}
        />
      )}

      {activeTab === 'approvals' && (
        <ApprovalQueue
          approvals={props.approvals}
          onApprove={props.onApprove}
          onReject={props.onReject}
          filterType={approvalFilter}
          onFilterChange={setApprovalFilter}
        />
      )}

      {activeTab === 'audit' && (
        <AuditLogViewer
          entries={props.auditEntries}
          total={props.auditTotal}
          page={props.auditPage}
          pageSize={props.auditPageSize}
          onQueryChange={props.onAuditQueryChange}
        />
      )}

      {activeTab === 'brand' && props.brandKit && (
        <BrandKitEditor
          brandKit={props.brandKit}
          onUpdateColors={props.onUpdateBrandColors}
          onUpdateFonts={props.onUpdateBrandFonts}
          onUploadLogo={props.onUploadLogo}
          onToggleColorLock={props.onToggleColorLock}
          onToggleFontLock={props.onToggleFontLock}
        />
      )}

      {activeTab === 'brand' && !props.brandKit && (
        <p>No brand kit configured for this workspace.</p>
      )}
    </div>
  );
}
