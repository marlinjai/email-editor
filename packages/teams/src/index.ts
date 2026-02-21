// Types
export type {
  WorkspaceRole,
  WorkspaceMember,
  ApprovalStatus,
  ApprovalResourceType,
  ApprovalRequest,
  AuditLogEntry,
  BrandKit,
  BrandColor,
  BrandFont,
  AuditLogQueryOptions,
  CreateMemberInput,
  CreateBrandKitInput,
  UpdateBrandKitInput,
} from './types';

export { PERMISSIONS } from './types';

// Adapter
export type { TeamsStorageAdapter } from './adapter';

// Schema
export { TEAMS_TABLES, bootstrapTeamsTables } from './schema';
export type { TableColumnDef, TableSchemaDef } from './schema';

// Managers
export { WorkspaceManager } from './workspace-manager';
export { ApprovalManager } from './approval';
export { AuditLogger } from './audit-log';
export { BrandKitManager } from './brand-kit';

// Components
export { MemberList, type MemberListProps } from './components/MemberList';
export { ApprovalQueue, type ApprovalQueueProps } from './components/ApprovalQueue';
export { AuditLogViewer, type AuditLogViewerProps } from './components/AuditLogViewer';
export { BrandKitEditor, type BrandKitEditorProps } from './components/BrandKitEditor';
export { WorkspaceSettings, type WorkspaceSettingsProps } from './components/WorkspaceSettings';
