export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  name?: string;
  role: WorkspaceRole;
  invitedAt: string;
  acceptedAt?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalResourceType = 'template' | 'campaign';

export interface ApprovalRequest {
  id: string;
  resourceType: ApprovalResourceType;
  resourceId: string;
  requestedBy: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  occurredAt: string;
}

export interface BrandKit {
  id: string;
  workspaceId: string;
  name: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  logoFileId?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandColor {
  name: string;
  value: string;
  locked: boolean;
}

export interface BrandFont {
  name: string;
  fontFamily: string;
  locked: boolean;
}

export const PERMISSIONS: Record<WorkspaceRole, string[]> = {
  owner: ['*'],
  admin: [
    'template.create',
    'template.edit',
    'template.delete',
    'template.approve',
    'campaign.create',
    'campaign.send',
    'contact.manage',
    'member.invite',
    'settings.edit',
  ],
  editor: ['template.create', 'template.edit', 'campaign.create', 'contact.manage'],
  viewer: ['template.view', 'campaign.view', 'contact.view'],
};

export interface AuditLogQueryOptions {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateMemberInput {
  workspaceId: string;
  userId: string;
  email: string;
  name?: string;
  role: WorkspaceRole;
}

export interface CreateBrandKitInput {
  workspaceId: string;
  name: string;
  colors?: BrandColor[];
  fonts?: BrandFont[];
}

export interface UpdateBrandKitInput {
  name?: string;
  colors?: BrandColor[];
  fonts?: BrandFont[];
  logoFileId?: string;
  logoUrl?: string;
}
