import type { TeamsStorageAdapter } from './adapter';
import type { WorkspaceMember, WorkspaceRole, CreateMemberInput } from './types';
import { PERMISSIONS } from './types';

export class WorkspaceManager {
  constructor(private readonly adapter: TeamsStorageAdapter) {}

  async createWorkspace(
    ownerId: string,
    ownerEmail: string,
    ownerName?: string
  ): Promise<WorkspaceMember> {
    const workspaceId = crypto.randomUUID();
    return this.adapter.createMember({
      workspaceId,
      userId: ownerId,
      email: ownerEmail,
      name: ownerName,
      role: 'owner',
    });
  }

  async inviteMember(
    input: CreateMemberInput,
    invitedByUserId: string
  ): Promise<WorkspaceMember> {
    const inviter = await this.adapter.getMember(input.workspaceId, invitedByUserId);
    if (!inviter) {
      throw new Error('Inviter is not a member of this workspace');
    }
    if (!this.checkPermission(inviter.role, 'member.invite')) {
      throw new Error('Insufficient permissions to invite members');
    }

    const existing = await this.adapter.getMember(input.workspaceId, input.userId);
    if (existing) {
      throw new Error('User is already a member of this workspace');
    }

    return this.adapter.createMember(input);
  }

  async acceptInvitation(memberId: string): Promise<WorkspaceMember> {
    return this.adapter.acceptInvitation(memberId);
  }

  async changeMemberRole(
    memberId: string,
    newRole: WorkspaceRole,
    changedByUserId: string
  ): Promise<WorkspaceMember> {
    const member = await this.adapter.getMemberById(memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    const changer = await this.adapter.getMember(member.workspaceId, changedByUserId);
    if (!changer) {
      throw new Error('You are not a member of this workspace');
    }

    if (member.role === 'owner' && changer.role !== 'owner') {
      throw new Error('Only owners can change another owner\'s role');
    }

    if (newRole === 'owner' && changer.role !== 'owner') {
      throw new Error('Only owners can promote to owner');
    }

    if (!this.checkPermission(changer.role, 'settings.edit')) {
      throw new Error('Insufficient permissions to change roles');
    }

    return this.adapter.updateMemberRole(memberId, newRole);
  }

  async removeMember(
    memberId: string,
    removedByUserId: string
  ): Promise<void> {
    const member = await this.adapter.getMemberById(memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    if (member.role === 'owner') {
      throw new Error('Cannot remove the workspace owner');
    }

    const remover = await this.adapter.getMember(member.workspaceId, removedByUserId);
    if (!remover) {
      throw new Error('You are not a member of this workspace');
    }

    if (!this.checkPermission(remover.role, 'settings.edit')) {
      throw new Error('Insufficient permissions to remove members');
    }

    return this.adapter.removeMember(memberId);
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.adapter.listMembers(workspaceId);
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.adapter.getMember(workspaceId, userId);
  }

  hasPermission(role: WorkspaceRole, permission: string): boolean {
    return this.checkPermission(role, permission);
  }

  private checkPermission(role: WorkspaceRole, permission: string): boolean {
    const perms = PERMISSIONS[role];
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  }
}
