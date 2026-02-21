import type {
  Contact,
  ContactListOptions,
  ContactStorageAdapter,
  CreateContactInput,
  Segment,
  SegmentRule,
  Unsubscribe,
  UpdateContactInput,
} from './types';
import type {
  WorkspaceRole,
  TeamsStorageAdapter,
} from '@marlinjai/email-teams';
import { PERMISSIONS } from '@marlinjai/email-teams';

export interface WorkspaceScopedContactConfig {
  adapter: ContactStorageAdapter;
  teamsAdapter: TeamsStorageAdapter;
  workspaceId: string;
  userId: string;
  userRole: WorkspaceRole;
}

// Map of permissions that imply other permissions (manage implies view)
const IMPLIES: Record<string, string> = {
  'contact.view': 'contact.manage',
  'template.view': 'template.edit',
  'campaign.view': 'campaign.create',
};

function hasPermission(role: WorkspaceRole, permission: string): boolean {
  const perms = PERMISSIONS[role];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const impliedBy = IMPLIES[permission];
  if (impliedBy && perms.includes(impliedBy)) return true;
  return false;
}

/**
 * Wraps ContactStorageAdapter with workspace-scoped permission checks
 * and audit logging for all contact operations.
 */
export class WorkspaceScopedContactManager {
  private readonly adapter: ContactStorageAdapter;
  private readonly teamsAdapter: TeamsStorageAdapter;
  private readonly workspaceId: string;
  private readonly userId: string;
  private readonly userRole: WorkspaceRole;

  constructor(config: WorkspaceScopedContactConfig) {
    this.adapter = config.adapter;
    this.teamsAdapter = config.teamsAdapter;
    this.workspaceId = config.workspaceId;
    this.userId = config.userId;
    this.userRole = config.userRole;
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    this.assertPermission('contact.manage');
    const contact = await this.adapter.createContact(input);
    await this.logAction('contact.created', contact.id);
    return contact;
  }

  async getContact(id: string): Promise<Contact | null> {
    this.assertPermission('contact.view');
    return this.adapter.getContact(id);
  }

  async getContactByEmail(email: string): Promise<Contact | null> {
    this.assertPermission('contact.view');
    return this.adapter.getContactByEmail(email);
  }

  async listContacts(options?: ContactListOptions): Promise<{ data: Contact[]; total: number }> {
    this.assertPermission('contact.view');
    return this.adapter.listContacts(options);
  }

  async updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
    this.assertPermission('contact.manage');
    const contact = await this.adapter.updateContact(id, input);
    await this.logAction('contact.updated', id);
    return contact;
  }

  async deleteContact(id: string): Promise<void> {
    this.assertPermission('contact.manage');
    await this.logAction('contact.deleted', id);
    return this.adapter.deleteContact(id);
  }

  async bulkCreateContacts(
    contacts: CreateContactInput[]
  ): Promise<{ created: number; updated: number }> {
    this.assertPermission('contact.manage');
    const result = await this.adapter.bulkCreateContacts(contacts);
    await this.logAction('contact.bulk_import', 'bulk', {
      created: result.created,
      updated: result.updated,
      total: contacts.length,
    });
    return result;
  }

  async createSegment(name: string, rules: SegmentRule[], description?: string): Promise<Segment> {
    this.assertPermission('contact.manage');
    const segment = await this.adapter.createSegment(name, rules, description);
    await this.logAction('segment.created', segment.id);
    return segment;
  }

  async listSegments(): Promise<Segment[]> {
    this.assertPermission('contact.view');
    return this.adapter.listSegments();
  }

  async getSegmentContacts(
    segmentId: string,
    options?: ContactListOptions
  ): Promise<{ data: Contact[]; total: number }> {
    this.assertPermission('contact.view');
    return this.adapter.getSegmentContacts(segmentId, options);
  }

  async deleteSegment(id: string): Promise<void> {
    this.assertPermission('contact.manage');
    await this.logAction('segment.deleted', id);
    return this.adapter.deleteSegment(id);
  }

  async recordUnsubscribe(
    contactId: string,
    reason?: string,
    method?: Unsubscribe['method']
  ): Promise<void> {
    await this.adapter.recordUnsubscribe(contactId, reason, method);
    await this.logAction('contact.unsubscribed', contactId, { reason, method });
  }

  async isUnsubscribed(contactId: string): Promise<boolean> {
    return this.adapter.isUnsubscribed(contactId);
  }

  // --- Internal helpers ---

  private assertPermission(permission: string): void {
    if (!hasPermission(this.userRole, permission)) {
      throw new Error(
        `Permission denied: role '${this.userRole}' does not have '${permission}'`
      );
    }
  }

  private async logAction(
    action: string,
    resourceId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.teamsAdapter.createAuditEntry({
      workspaceId: this.workspaceId,
      userId: this.userId,
      action,
      resourceType: 'contact',
      resourceId,
      details,
    });
  }
}
