import type { TeamsStorageAdapter } from './adapter';
import type {
  ApprovalRequest,
  ApprovalResourceType,
  ApprovalStatus,
  WorkspaceRole,
} from './types';
import { PERMISSIONS } from './types';

export class ApprovalManager {
  constructor(private readonly adapter: TeamsStorageAdapter) {}

  async requestApproval(
    resourceType: ApprovalResourceType,
    resourceId: string,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    const existing = await this.adapter.getApprovalByResource(resourceType, resourceId);
    if (existing && existing.status === 'pending') {
      throw new Error('An approval request already exists for this resource');
    }

    return this.adapter.createApproval({
      resourceType,
      resourceId,
      requestedBy,
    });
  }

  async listPending(
    resourceType?: ApprovalResourceType
  ): Promise<ApprovalRequest[]> {
    return this.adapter.listPendingApprovals(resourceType);
  }

  async approve(
    approvalId: string,
    reviewedBy: string,
    reviewerRole: WorkspaceRole,
    reviewNote?: string
  ): Promise<ApprovalRequest> {
    this.assertCanApprove(reviewerRole);
    return this.adapter.updateApprovalStatus(approvalId, 'approved', reviewedBy, reviewNote);
  }

  async reject(
    approvalId: string,
    reviewedBy: string,
    reviewerRole: WorkspaceRole,
    reviewNote?: string
  ): Promise<ApprovalRequest> {
    this.assertCanApprove(reviewerRole);
    return this.adapter.updateApprovalStatus(approvalId, 'rejected', reviewedBy, reviewNote);
  }

  async isApproved(
    resourceType: ApprovalResourceType,
    resourceId: string
  ): Promise<boolean> {
    const approval = await this.adapter.getApprovalByResource(resourceType, resourceId);
    return approval?.status === 'approved';
  }

  async getStatus(
    resourceType: ApprovalResourceType,
    resourceId: string
  ): Promise<ApprovalStatus | null> {
    const approval = await this.adapter.getApprovalByResource(resourceType, resourceId);
    return approval?.status ?? null;
  }

  private assertCanApprove(role: WorkspaceRole): void {
    const perms = PERMISSIONS[role];
    if (!perms.includes('*') && !perms.includes('template.approve')) {
      throw new Error('Only admins and owners can approve or reject requests');
    }
  }
}
