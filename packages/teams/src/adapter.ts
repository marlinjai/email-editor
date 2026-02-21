import type {
  WorkspaceMember,
  ApprovalRequest,
  AuditLogEntry,
  BrandKit,
  WorkspaceRole,
  ApprovalStatus,
  ApprovalResourceType,
  CreateMemberInput,
  CreateBrandKitInput,
  UpdateBrandKitInput,
  AuditLogQueryOptions,
} from './types';

export interface TeamsStorageAdapter {
  // Members
  createMember(input: CreateMemberInput): Promise<WorkspaceMember>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  getMemberById(id: string): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  updateMemberRole(id: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  acceptInvitation(id: string): Promise<WorkspaceMember>;
  removeMember(id: string): Promise<void>;

  // Approvals
  createApproval(input: {
    resourceType: ApprovalResourceType;
    resourceId: string;
    requestedBy: string;
  }): Promise<ApprovalRequest>;
  getApproval(id: string): Promise<ApprovalRequest | null>;
  listPendingApprovals(resourceType?: ApprovalResourceType): Promise<ApprovalRequest[]>;
  updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    reviewedBy: string,
    reviewNote?: string
  ): Promise<ApprovalRequest>;
  getApprovalByResource(
    resourceType: ApprovalResourceType,
    resourceId: string
  ): Promise<ApprovalRequest | null>;

  // Audit log
  createAuditEntry(input: {
    workspaceId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
  }): Promise<AuditLogEntry>;
  queryAuditLog(
    workspaceId: string,
    options?: AuditLogQueryOptions
  ): Promise<{ data: AuditLogEntry[]; total: number }>;

  // Brand kits
  createBrandKit(input: CreateBrandKitInput): Promise<BrandKit>;
  getBrandKit(id: string): Promise<BrandKit | null>;
  getBrandKitByWorkspace(workspaceId: string): Promise<BrandKit | null>;
  updateBrandKit(id: string, input: UpdateBrandKitInput): Promise<BrandKit>;
  deleteBrandKit(id: string): Promise<void>;
}
